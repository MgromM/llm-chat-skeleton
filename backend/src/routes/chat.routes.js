import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireAuthViaHeaderOrQuery } from '../middleware/auth.js';
import { query } from '../config/db.js';
import { handleChatTurn, streamChatTurn, continueFromUserMessage, deleteMessagesFrom } from '../services/chatCore/pipeline.js';
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
  if (req.path.startsWith('/attachments/')) return next();
  return requireAuth(req, res, next);
});

chatRouter.post('/conversations', async (req, res, next) => {
  try {
    const { rows } = await query(
      'INSERT INTO conversations (user_id, title) VALUES ($1, $2) RETURNING id, title, created_at',
      [req.user.sub, req.body.title ?? null],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

chatRouter.get('/conversations', async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT id, title, created_at FROM conversations WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.sub],
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/** Renames a conversation's title. */
chatRouter.patch('/conversations/:id', async (req, res, next) => {
  try {
    const title = (req.body.title ?? '').trim();
    if (!title) return res.status(400).json({ error: 'title required' });

    const { rows } = await query(
      'UPDATE conversations SET title = $1 WHERE id = $2 AND user_id = $3 RETURNING id, title, created_at',
      [title, req.params.id, req.user.sub],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Conversation not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
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
      `SELECT a.storage_path FROM message_attachments a
       JOIN messages m ON m.id = a.message_id
       WHERE m.conversation_id = $1`,
      [req.params.id],
    );
    await Promise.all(attachments.map((a) => deleteAttachmentFile(a.storage_path)));

    // ON DELETE CASCADE takes care of messages/message_attachments rows.
    await query('DELETE FROM conversations WHERE id = $1 AND user_id = $2', [req.params.id, req.user.sub]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

async function fetchMessages(conversationId, userId) {
  const { rows } = await query(
    `SELECT m.id, m.role, m.content, m.created_at, m.command_used
     FROM messages m
     JOIN conversations c ON c.id = m.conversation_id
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

    streamTurnResponse(req, res, (onChunk, signal) =>
      streamChatTurn({ conversationId: req.params.id, userId: req.user.sub, userMessage: message, attachments, onChunk, signal }),
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

chatRouter.get('/attachments/:id', requireAuthViaHeaderOrQuery, async (req, res, next) => {
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
