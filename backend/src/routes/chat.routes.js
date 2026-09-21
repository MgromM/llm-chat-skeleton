import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireAuthViaHeaderOrQuery } from '../middleware/auth.js';
import { attachUserDbContext } from '../middleware/dbContext.js';
import { query } from '../config/db.js';
import {
  handleChatTurn,
  streamChatTurn,
  continueFromUserMessage,
  deleteMessagesFrom,
  classifyDraftMessage,
  estimateTurnCost,
  branchConversation,
  STYLE_PRESETS,
} from '../services/chatCore/pipeline.js';
import { getAnthropicClient } from '../services/anthropicClient.js';
import { FILES_API_BETA } from '../services/mcp/codeExecutionTool.js';
import { readAttachmentFile, deleteAttachmentFile, MAX_FILE_SIZE_BYTES, MAX_FILES_PER_MESSAGE } from '../services/attachments/attachmentStore.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: MAX_FILES_PER_MESSAGE },
});

// MIME types safe to render inline in the browser (no script execution risk).
// Anything else (text/html, image/svg+xml, etc.) is a stored-XSS vector if
// served with the attacker-supplied Content-Type and `inline` disposition,
// so it gets forced to a plain download instead.
const INLINE_SAFE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'text/plain',
  'text/csv',
  'text/markdown',
  'application/json',
  'application/pdf',
]);

export const chatRouter = Router();

// Every route requires auth via the standard Authorization header; the
// attachment-download route below is the sole exception (it also accepts a
// `?token=` query param, since `<img>`/`<a>` tags can't set headers).
chatRouter.use((req, res, next) => {
  if (req.path.startsWith('/attachments/') || req.path.startsWith('/generated-files/')) return next();
  return requireAuth(req, res, (err) => {
    if (err) return next(err);
    attachUserDbContext(req, res, next);
  });
});

chatRouter.post('/conversations', async (req, res, next) => {
  try {
    const isTemporary = req.body.isTemporary === true;
    const { rows } = await query(
      'INSERT INTO conversations (user_id, title, is_temporary) VALUES ($1, $2, $3) RETURNING id, title, created_at, model, system_prompt, is_temporary',
      [req.user.sub, req.body.title ?? null, isTemporary],
    );
    res.status(201).json({ ...rows[0], systemPrompt: rows[0].system_prompt, isTemporary: rows[0].is_temporary });
  } catch (err) {
    next(err);
  }
});

// Item 17 (temporary/incognito conversations): excluded from the default
// list, same as Claude.ai's "temporary chat" not showing up in history.
// `?includeTemporary=true` opts back in (used by the sidebar while one is
// active, so the user doesn't lose access to it mid-session). Note this is
// visibility-only -- the conversation is still fully persisted, still runs
// through the leak-detection/classify pipeline, and is still subject to the
// same retention job as any other conversation (see migration 030).
chatRouter.get('/conversations', async (req, res, next) => {
  try {
    const includeTemporary = req.query.includeTemporary === 'true';
    const { rows } = await query(
      `SELECT id, title, created_at, model, system_prompt, style, branched_from_conversation_id, branched_from_message_id, project_id, is_temporary
       FROM conversations WHERE user_id = $1 ${includeTemporary ? '' : 'AND is_temporary = false'} ORDER BY created_at DESC`,
      [req.user.sub],
    );
    res.json(
      rows.map((r) => ({
        ...r,
        systemPrompt: r.system_prompt,
        branchedFromConversationId: r.branched_from_conversation_id,
        branchedFromMessageId: r.branched_from_message_id,
        projectId: r.project_id,
        isTemporary: r.is_temporary,
      })),
    );
  } catch (err) {
    next(err);
  }
});

// Item 19 (UI/UX audit): a usage indicator for regular users, not just the
// admin metrics panel. There is no per-user quota in this system -- the
// only real limit is the org-wide soft monthly cost cap (MONTHLY_BUDGET_USD,
// see config/budget.js), checked before every LLM call and shared by every
// user. So this returns that same global budget status (spent/limit for the
// current calendar month, same query checkMonthlyBudget() uses) plus the
// caller's own cost/message count contribution to it this month, scoped by
// RLS to their own conversations/messages. No new table or migration --
// usage_metrics already has everything needed.
chatRouter.get('/me/usage', async (req, res, next) => {
  try {
    const limit = Number(process.env.MONTHLY_BUDGET_USD);
    const hasLimit = Boolean(limit) && !Number.isNaN(limit);

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [{ rows: totalRows }, { rows: mineRows }] = await Promise.all([
      hasLimit
        ? query('SELECT COALESCE(SUM(cost_usd), 0) AS total FROM usage_metrics WHERE created_at >= $1', [
            startOfMonth.toISOString(),
          ])
        : Promise.resolve({ rows: [{ total: 0 }] }),
      query(
        `SELECT COUNT(*) AS messages, COALESCE(SUM(um.cost_usd), 0) AS cost_usd
         FROM usage_metrics um
         JOIN messages m ON m.id = um.message_id
         JOIN conversations c ON c.id = m.conversation_id
         WHERE c.user_id = $1 AND um.created_at >= $2`,
        [req.user.sub, startOfMonth.toISOString()],
      ),
    ]);

    res.json({
      periodStart: startOfMonth.toISOString(),
      orgBudget: hasLimit
        ? { limitUsd: limit, spentUsd: Number(totalRows[0].total) }
        : null,
      mine: {
        messages: Number(mineRows[0].messages),
        costUsd: Number(mineRows[0].cost_usd),
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Branches a conversation from a given message: creates a new conversation
 * that starts as a copy of everything up to that point, so the specialist
 * can try a different direction without disturbing the original thread.
 */
chatRouter.post('/conversations/:id/messages/:messageId/branch', async (req, res, next) => {
  try {
    const newConversation = await branchConversation({
      conversationId: req.params.id,
      userId: req.user.sub,
      messageId: req.params.messageId,
    });
    res.status(201).json(newConversation);
  } catch (err) {
    if (err.message === 'Conversation not found' || err.message === 'Message not found') {
      return res.status(404).json({ error: err.message });
    }
    next(err);
  }
});

// Models the user is allowed to pick per-conversation. Keep in sync with
// MODEL_PRICING_PER_MTOK in anthropicClient.js.
const AVAILABLE_MODELS = ['claude-sonnet-5', 'claude-opus-5', 'claude-haiku-4-5-20251001'];

/** Renames a conversation's title, and/or updates its model / system prompt. */
chatRouter.patch('/conversations/:id', async (req, res, next) => {
  try {
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (req.body.title !== undefined) {
      const title = String(req.body.title).trim();
      if (!title) return res.status(400).json({ error: 'title must not be empty' });
      updates.push(`title = $${paramIndex++}`);
      values.push(title);
    }
    if (req.body.model !== undefined) {
      const model = req.body.model === null ? null : String(req.body.model);
      if (model !== null && !AVAILABLE_MODELS.includes(model)) {
        return res.status(400).json({ error: `model must be one of: ${AVAILABLE_MODELS.join(', ')}` });
      }
      updates.push(`model = $${paramIndex++}`);
      values.push(model);
    }
    if (req.body.systemPrompt !== undefined) {
      const systemPrompt = req.body.systemPrompt === null ? null : String(req.body.systemPrompt).trim() || null;
      updates.push(`system_prompt = $${paramIndex++}`);
      values.push(systemPrompt);
    }
    if (req.body.projectId !== undefined) {
      const projectId = req.body.projectId === null ? null : Number(req.body.projectId);
      if (projectId !== null && !Number.isInteger(projectId)) {
        return res.status(400).json({ error: 'projectId must be an integer or null' });
      }
      if (projectId !== null) {
        const { rows: projectRows } = await query('SELECT id FROM projects WHERE id = $1 AND user_id = $2', [
          projectId,
          req.user.sub,
        ]);
        if (projectRows.length === 0) return res.status(404).json({ error: 'Project not found' });
      }
      updates.push(`project_id = $${paramIndex++}`);
      values.push(projectId);
    }
    if (req.body.style !== undefined) {
      const style = req.body.style === null ? null : String(req.body.style);
      if (style !== null && !Object.prototype.hasOwnProperty.call(STYLE_PRESETS, style)) {
        return res.status(400).json({ error: `style must be one of: ${Object.keys(STYLE_PRESETS).join(', ')}` });
      }
      updates.push(`style = $${paramIndex++}`);
      values.push(style);
    }
    if (req.body.isTemporary !== undefined) {
      updates.push(`is_temporary = $${paramIndex++}`);
      values.push(req.body.isTemporary === true);
    }
    if (updates.length === 0) return res.status(400).json({ error: 'nothing to update' });

    values.push(req.params.id, req.user.sub);
    const { rows } = await query(
      `UPDATE conversations SET ${updates.join(', ')} WHERE id = $${paramIndex++} AND user_id = $${paramIndex}
       RETURNING id, title, created_at, model, system_prompt, project_id, style, is_temporary`,
      values,
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Conversation not found' });
    res.json({
      id: rows[0].id,
      title: rows[0].title,
      created_at: rows[0].created_at,
      model: rows[0].model,
      systemPrompt: rows[0].system_prompt,
      projectId: rows[0].project_id,
      style: rows[0].style,
      isTemporary: rows[0].is_temporary,
    });
  } catch (err) {
    next(err);
  }
});

chatRouter.get('/conversations/models', (req, res) => {
  res.json({ models: AVAILABLE_MODELS });
});

/** Fixed set of response-style presets (item 15) the user can pick per-conversation. */
chatRouter.get('/conversations/styles', (req, res) => {
  res.json({
    styles: Object.entries(STYLE_PRESETS).map(([key, { label }]) => ({ key, label })),
  });
});

/** Deletes a conversation and its messages/attachments (files on disk included). */
chatRouter.delete('/conversations/:id', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT id FROM conversations WHERE id = $1 AND user_id = $2', [
      req.params.id,
      req.user.sub,
    ]);
    if (rows.length === 0) return res.status(404).json({ error: 'Conversation not found' });

    const { rows: attachments } = await query(
      `SELECT DISTINCT a.storage_path FROM message_attachments a
       JOIN messages m ON m.id = a.message_id
       WHERE m.conversation_id = $1`,
      [req.params.id],
    );

    // ON DELETE CASCADE takes care of messages/message_attachments rows.
    await query('DELETE FROM conversations WHERE id = $1 AND user_id = $2', [req.params.id, req.user.sub]);

    // A branched conversation shares attachment storage_paths with its
    // source instead of duplicating files on disk — only delete a file once
    // no message (in any conversation) still references it.
    await Promise.all(
      attachments.map(async (a) => {
        const { rows: stillReferenced } = await query(
          'SELECT 1 FROM message_attachments WHERE storage_path = $1 LIMIT 1',
          [a.storage_path],
        );
        if (stillReferenced.length === 0) await deleteAttachmentFile(a.storage_path);
      }),
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** Searches the current user's conversations by message content. */
chatRouter.get('/conversations/search', async (req, res, next) => {
  try {
    const q = (req.query.q ?? '').toString().trim();
    if (!q) return res.json([]);

    const { rows } = await query(
      `SELECT DISTINCT ON (c.id) c.id, c.title, c.created_at, c.model, c.system_prompt,
              m.content AS matched_snippet
       FROM conversations c
       JOIN messages m ON m.conversation_id = c.id
       WHERE c.user_id = $1 AND m.content ILIKE $2
       ORDER BY c.id, m.created_at DESC`,
      [req.user.sub, `%${q}%`],
    );
    rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json(
      rows.map((r) => ({
        id: r.id,
        title: r.title,
        created_at: r.created_at,
        model: r.model,
        systemPrompt: r.system_prompt,
        matchedSnippet: r.matched_snippet.length > 160 ? `${r.matched_snippet.slice(0, 160)}…` : r.matched_snippet,
      })),
    );
  } catch (err) {
    next(err);
  }
});

async function fetchMessages(conversationId, userId) {
  const { rows } = await query(
    `SELECT m.id, m.role, m.content, m.created_at, m.command_used, m.citations, m.generated_files, a.id AS artifact_id
     FROM messages m
     JOIN conversations c ON c.id = m.conversation_id
     LEFT JOIN artifacts a ON a.message_id = m.id
     WHERE m.conversation_id = $1 AND c.user_id = $2
     ORDER BY m.created_at ASC, m.id ASC`,
    [conversationId, userId],
  );

  const messageIds = rows.map((r) => r.id);
  const attachmentsByMessage = new Map();
  if (messageIds.length > 0) {
    const { rows: attachmentRows } = await query(
      `SELECT id, message_id, filename, mime_type, size_bytes
       FROM message_attachments WHERE message_id = ANY($1) ORDER BY id ASC`,
      [messageIds],
    );
    for (const a of attachmentRows) {
      if (!attachmentsByMessage.has(a.message_id)) attachmentsByMessage.set(a.message_id, []);
      attachmentsByMessage.get(a.message_id).push({
        id: a.id,
        filename: a.filename,
        mimeType: a.mime_type,
        sizeBytes: a.size_bytes,
      });
    }
  }

  return rows.map((r) => ({
    id: r.id,
    role: r.role,
    content: r.content,
    created_at: r.created_at,
    commandUsed: r.command_used,
    citations: r.citations ?? null,
    generatedFiles: r.generated_files ?? null,
    artifactId: r.artifact_id ?? null,
    attachments: attachmentsByMessage.get(r.id) ?? [],
  }));
}

chatRouter.get('/conversations/:id/messages', async (req, res, next) => {
  try {
    res.json(await fetchMessages(req.params.id, req.user.sub));
  } catch (err) {
    next(err);
  }
});

/** Exports a conversation's messages as a downloadable markdown file. */
chatRouter.get('/conversations/:id/export', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT id, title FROM conversations WHERE id = $1 AND user_id = $2', [
      req.params.id,
      req.user.sub,
    ]);
    if (rows.length === 0) return res.status(404).json({ error: 'Conversation not found' });

    const messages = await fetchMessages(req.params.id, req.user.sub);
    const title = rows[0].title?.trim() || `Rozmowa ${rows[0].id}`;
    const lines = [`# ${title}`, ''];
    for (const m of messages) {
      const speaker = m.role === 'user' ? 'Użytkownik' : 'Asystent';
      lines.push(`## ${speaker} — ${new Date(m.created_at).toLocaleString('pl-PL')}`, '');
      if (m.content) lines.push(m.content, '');
      for (const a of m.attachments) lines.push(`_Załącznik: ${a.filename}_`, '');
    }
    const markdown = lines.join('\n');

    const filename = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'rozmowa'}.md`;
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(markdown);
  } catch (err) {
    next(err);
  }
});

/** Streams a turn's reply over SSE: `delta` events with text chunks, then one `done` event with metadata. */
function streamTurnResponse(req, res, runTurn) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const controller = new AbortController();
  req.on('close', () => controller.abort());

  let emittedAny = false;
  const onChunk = (delta) => {
    emittedAny = true;
    res.write(`data: ${JSON.stringify({ type: 'delta', text: delta })}\n\n`);
  };

  runTurn(onChunk, controller.signal)
    .then((result) => {
      // Bypass/blocked/budget replies resolve instantly without ever calling
      // onChunk — emit the whole thing as one chunk so the frontend's
      // streaming renderer still shows it.
      if (!emittedAny && result.reply) {
        res.write(`data: ${JSON.stringify({ type: 'delta', text: result.reply })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ type: 'done', ...result })}\n\n`);
      res.end();
    })
    .catch((err) => {
      res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
      res.end();
    });
}

/**
 * Classifies a draft message against the data-sensitivity policy BEFORE it
 * is sent — lets the frontend show the block reason or a confirmation
 * prompt without spending a real chat turn (no message is saved here).
 */
chatRouter.post('/conversations/:id/classify', async (req, res, next) => {
  try {
    const message = (req.body.message ?? '').toString();
    if (!message.trim()) return res.status(400).json({ error: 'message required' });

    const { rows } = await query('SELECT id FROM conversations WHERE id = $1 AND user_id = $2', [
      req.params.id,
      req.user.sub,
    ]);
    if (rows.length === 0) return res.status(404).json({ error: 'Conversation not found' });

    const classification = await classifyDraftMessage({ conversationId: req.params.id, userId: req.user.sub, userMessage: message });
    res.json(classification);
  } catch (err) {
    next(err);
  }
});

/**
 * Estimates the input-token cost of the current draft BEFORE sending it, so
 * the frontend can show it next to the send button. Doesn't touch the DB or
 * spend any real tokens — `countTokens` is free.
 */
chatRouter.post('/conversations/:id/estimate', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT id FROM conversations WHERE id = $1 AND user_id = $2', [
      req.params.id,
      req.user.sub,
    ]);
    if (rows.length === 0) return res.status(404).json({ error: 'Conversation not found' });

    const estimate = await estimateTurnCost({ conversationId: req.params.id, draftText: req.body.message ?? '' });
    res.json(estimate);
  } catch (err) {
    next(err);
  }
});

chatRouter.post('/conversations/:id/messages', upload.array('files', MAX_FILES_PER_MESSAGE), async (req, res, next) => {
  try {
    const message = req.body.message ?? '';
    const files = req.files ?? [];
    if (!message.trim() && files.length === 0) {
      return res.status(400).json({ error: 'message or files required' });
    }

    const { rows } = await query('SELECT id FROM conversations WHERE id = $1 AND user_id = $2', [
      req.params.id,
      req.user.sub,
    ]);
    if (rows.length === 0) return res.status(404).json({ error: 'Conversation not found' });

    const attachments = files.map((f) => ({ buffer: f.buffer, filename: f.originalname, mimeType: f.mimetype, sizeBytes: f.size }));
    const overrideBlock = req.body.override === 'true' || req.body.override === true;

    streamTurnResponse(req, res, (onChunk, signal) =>
      streamChatTurn({ conversationId: req.params.id, userId: req.user.sub, userMessage: message, attachments, onChunk, signal, overrideBlock }),
    );
  } catch (err) {
    next(err);
  }
});

/** Non-streaming fallback, kept for any caller that just wants the final JSON (e.g. scripts/tests). */
chatRouter.post('/conversations/:id/messages/sync', upload.array('files', MAX_FILES_PER_MESSAGE), async (req, res, next) => {
  try {
    const message = req.body.message ?? '';
    const files = req.files ?? [];
    if (!message.trim() && files.length === 0) {
      return res.status(400).json({ error: 'message or files required' });
    }
    const { rows } = await query('SELECT id FROM conversations WHERE id = $1 AND user_id = $2', [req.params.id, req.user.sub]);
    if (rows.length === 0) return res.status(404).json({ error: 'Conversation not found' });

    const result = await handleChatTurn({
      conversationId: req.params.id,
      userId: req.user.sub,
      userMessage: message,
      attachments: files.map((f) => ({ buffer: f.buffer, filename: f.originalname, mimeType: f.mimetype, sizeBytes: f.size })),
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/** Edits a previously-sent user message, drops everything after it, and streams a fresh reply. */
chatRouter.put('/conversations/:id/messages/:messageId', async (req, res, next) => {
  try {
    const content = (req.body.content ?? '').trim();
    if (!content) return res.status(400).json({ error: 'content required' });

    const { rows } = await query(
      `SELECT m.id FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE m.id = $1 AND m.conversation_id = $2 AND c.user_id = $3 AND m.role = 'user'`,
      [req.params.messageId, req.params.id, req.user.sub],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Message not found' });

    await query('UPDATE messages SET content = $1 WHERE id = $2', [content, req.params.messageId]);
    await deleteMessagesFrom(req.params.id, '>', req.params.messageId);

    streamTurnResponse(req, res, (onChunk, signal) =>
      continueFromUserMessage({
        conversationId: req.params.id,
        userId: req.user.sub,
        userMessageId: Number(req.params.messageId),
        onChunk,
        signal,
      }),
    );
  } catch (err) {
    next(err);
  }
});

/** Regenerates an assistant reply: drops it, then re-runs the turn for the user message before it. */
chatRouter.post('/conversations/:id/messages/:messageId/regenerate', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT m.id FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE m.id = $1 AND m.conversation_id = $2 AND c.user_id = $3 AND m.role = 'assistant'`,
      [req.params.messageId, req.params.id, req.user.sub],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Message not found' });

    const { rows: userRows } = await query(
      `SELECT id FROM messages WHERE conversation_id = $1 AND id < $2 AND role = 'user' ORDER BY id DESC LIMIT 1`,
      [req.params.id, req.params.messageId],
    );
    if (userRows.length === 0) return res.status(404).json({ error: 'No preceding user message to regenerate from' });

    // Truncate the regenerated reply *and* anything after it — same
    // semantics as editing the preceding user message, so a regenerate in
    // the middle of a conversation can't leave later turns referencing a
    // reply that no longer exists.
    await deleteMessagesFrom(req.params.id, '>=', req.params.messageId);

    streamTurnResponse(req, res, (onChunk, signal) =>
      continueFromUserMessage({
        conversationId: req.params.id,
        userId: req.user.sub,
        userMessageId: userRows[0].id,
        onChunk,
        signal,
      }),
    );
  } catch (err) {
    next(err);
  }
});

chatRouter.get('/attachments/:id', requireAuthViaHeaderOrQuery, attachUserDbContext, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT a.filename, a.mime_type, a.storage_path
       FROM message_attachments a
       JOIN messages m ON m.id = a.message_id
       JOIN conversations c ON c.id = m.conversation_id
       WHERE a.id = $1 AND c.user_id = $2`,
      [req.params.id, req.user.sub],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Attachment not found' });

    const attachment = rows[0];
    const buffer = await readAttachmentFile(attachment.storage_path);
    const isInlineSafe = INLINE_SAFE_MIME_TYPES.has(attachment.mime_type);
    res.setHeader('Content-Type', isInlineSafe ? attachment.mime_type : 'application/octet-stream');
    const disposition = isInlineSafe ? 'inline' : 'attachment';
    res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(attachment.filename)}"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

/**
 * Lists every file the model has generated via `code_execution` across all
 * of the user's conversations, newest first — backs the "Kod" tab so a
 * specialist can find a report they made a few conversations ago without
 * hunting back through chat history for it.
 */
chatRouter.get('/generated-files', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT
         elem->>'fileId' AS "fileId",
         elem->>'filename' AS filename,
         elem->>'mimeType' AS "mimeType",
         (elem->>'sizeBytes')::bigint AS "sizeBytes",
         m.id AS "messageId",
         m.created_at AS "createdAt",
         c.id AS "conversationId",
         c.title AS "conversationTitle"
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       CROSS JOIN LATERAL jsonb_array_elements(m.generated_files) elem
       WHERE c.user_id = $1
       ORDER BY m.created_at DESC`,
      [req.user.sub],
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/**
 * Streams a file the model generated via `code_execution` (e.g. a .csv/.xlsx
 * report) from Anthropic's Files API. Ownership is checked by looking for
 * the file_id inside some message's `generated_files` in a conversation the
 * requesting user owns — the id alone isn't a capability token, since
 * Anthropic file ids aren't scoped per-user.
 */
chatRouter.get('/generated-files/:fileId', requireAuthViaHeaderOrQuery, attachUserDbContext, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT elem->>'filename' AS filename, elem->>'mimeType' AS mime_type
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       CROSS JOIN LATERAL jsonb_array_elements(m.generated_files) elem
       WHERE c.user_id = $1 AND elem->>'fileId' = $2
       LIMIT 1`,
      [req.user.sub, req.params.fileId],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'File not found' });

    const { filename, mime_type: mimeType } = rows[0];
    const client = await getAnthropicClient();
    const download = await client.beta.files.download(req.params.fileId, {}, { headers: { 'anthropic-beta': FILES_API_BETA } });

    const isInlineSafe = INLINE_SAFE_MIME_TYPES.has(mimeType);
    res.setHeader('Content-Type', isInlineSafe ? mimeType : 'application/octet-stream');
    res.setHeader('Content-Disposition', `${isInlineSafe ? 'inline' : 'attachment'}; filename="${encodeURIComponent(filename)}"`);
    res.send(Buffer.from(await download.arrayBuffer()));
  } catch (err) {
    next(err);
  }
});
