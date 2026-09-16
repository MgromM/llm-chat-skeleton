import { getAnthropicClient } from '../anthropicClient.js';
import { bigQueryTool, runBigQueryTool } from '../mcp/bigqueryServer.js';
import { knowledgeSearchTool, runKnowledgeSearchTool } from '../mcp/knowledgeServer.js';
import { recordUsage } from '../metrics/usageTracker.js';
import { judgeResponse } from '../judge/qualityJudge.js';
import { parseCommand, dispatchCommand } from './slashDispatch.js';
import { createRedactionSession } from '../security/piiRedaction.js';
import { getRedactionTerms } from '../security/redactionTerms.js';
import { precheckMessage, PRECHECK_MODEL } from '../security/sensitiveDataPrecheck.js';
import { extractTextFromImages } from '../security/ocrExtraction.js';
import { detectUncertainLeak } from '../security/uncertainLeakAgent.js';
import { logAiAudit } from '../security/aiAuditLog.js';
import { checkMonthlyBudget } from '../../config/budget.js';
import { query } from '../../config/db.js';
import {
  saveAttachmentFile,
  readAttachmentFile,
  deleteAttachmentFile,
  isImageAttachment,
  isTextAttachment,
  isPdfAttachment,
} from '../attachments/attachmentStore.js';

const CHAT_MODEL = process.env.CHAT_MODEL ?? 'claude-sonnet-5';
const JUDGE_MODEL = process.env.JUDGE_MODEL ?? 'claude-haiku-4-5-20251001';
const TOOLS = [bigQueryTool, knowledgeSearchTool];

async function runTool(toolUse) {
  if (toolUse.name === 'query_bigquery') return runBigQueryTool(toolUse.input);
  if (toolUse.name === 'search_knowledge_base') return runKnowledgeSearchTool(toolUse.input);
  throw new Error(`Unknown tool: ${toolUse.name}`);
}
const MAX_HISTORY_MESSAGES = 20;
// Once history grows past this many messages, everything older than the
// last MAX_HISTORY_MESSAGES gets collapsed into one summary turn instead of
// being dropped outright — keeps long conversations coherent without
// sending the whole transcript on every request.
const SUMMARY_THRESHOLD = 30;
const MAX_TOOL_ROUNDS = 8;
// Sonnet 5 emits a `thinking` content block by default whenever `tools` is
// passed (even with an empty `thinking` field) — if that raw block is echoed
// back verbatim as history for the next call in the tool-use loop, the API
// rejects it ("each thinking block must contain thinking"). We don't rely on
// preserving that reasoning across our own loop, so drop it before resending.
function stripThinkingBlocks(content) {
  if (!Array.isArray(content)) return content;
  return content.filter((b) => b.type !== 'thinking' && b.type !== 'redacted_thinking');
}

/**
 * Runs every `tool_use` block found in a Claude response (not just the
 * first) and returns one `tool_result` block per call, matched by
 * `tool_use_id`. Claude can request several tools in a single turn
 * (parallel tool calls); if any of them were left unanswered, the next
 * request to the API is rejected with "tool_use ids were found without
 * tool_result blocks immediately after". Each tool call is isolated in its
 * own try/catch so one failing tool still lets every other tool_use in the
 * same turn get its matching tool_result (an error one, if needed) — no
 * tool_use is ever left dangling because of a thrown error.
 *
 * `redaction` (a session from `createRedactionSession`) is run over every
 * tool result before it's stringified into the message sent back to
 * Claude — BigQuery/RAG results can contain the same raw client names,
 * budgets, and PII as a pasted-in prompt, and without this they'd reach the
 * model (and, on the way back, the specialist) completely unredacted.
 */
async function runAllToolUses(content, redaction) {
  const toolUses = content.filter((b) => b.type === 'tool_use');
  const results = await Promise.all(
    toolUses.map(async (toolUse) => {
      let toolResult;
      try {
        toolResult = await runTool(toolUse);
      } catch (err) {
        toolResult = { error: err.message };
      }
      const redactedContent = redaction.redact(JSON.stringify(toolResult));
      return { type: 'tool_result', tool_use_id: toolUse.id, content: redactedContent };
    }),
  );
  return results;
}

/**
 * Defensive net for whatever built `messages`: drops any `tool_use` blocks
 * in the last assistant message that don't have a matching `tool_result` in
 * the message right after (and drops that trailing assistant message
 * entirely if it becomes tool_use-only and empty). This mirrors
 * `stripThinkingBlocks` in spirit — sanitizing history right before it's
 * sent to the API, so a persistence gap or a partial-loop bug can't crash
 * the whole turn with a 400 from Anthropic.
 */
function stripOrphanedToolUses(messages) {
  const sanitized = messages.map((m) => ({ ...m }));
  for (let i = 0; i < sanitized.length; i++) {
    const msg = sanitized[i];
    if (msg.role !== 'assistant' || !Array.isArray(msg.content)) continue;
    const toolUseIds = msg.content.filter((b) => b.type === 'tool_use').map((b) => b.id);
    if (toolUseIds.length === 0) continue;

    const next = sanitized[i + 1];
    const resultIds = new Set(
      next && next.role === 'user' && Array.isArray(next.content)
        ? next.content.filter((b) => b.type === 'tool_result').map((b) => b.tool_use_id)
        : [],
    );
    const missing = toolUseIds.filter((id) => !resultIds.has(id));
    if (missing.length === 0) continue;

    const missingSet = new Set(missing);
    msg.content = msg.content.filter((b) => b.type !== 'tool_use' || !missingSet.has(b.id));
  }
  // Drop any assistant message that ended up with no content left at all
  // (e.g. it was purely orphaned tool_use blocks).
  return sanitized.filter((m) => !Array.isArray(m.content) || m.content.length > 0);
}
const TITLE_MAX_LENGTH = 60;

/** Builds the user-facing block message, naming the classification level and reason. */
function buildBlockedReply(precheck) {
  const levelLabel = precheck.level === 'czerwona' ? 'CZERWONA' : 'ŻÓŁTA';
  const reason = precheck.rationale ? ` Powód: ${precheck.rationale}.` : '';
  return `Ta wiadomość została zablokowana przez automatyczną kontrolę bezpieczeństwa danych — sklasyfikowano ją jako ${levelLabel} (kategoria: ${precheck.category ?? 'nieokreślona'}).${reason} Zgodnie z polityką Agencji wiadomości z tej kategorii wymagają narzędzi z Listy Zatwierdzonej w wersji Enterprise/Pro i nie mogą być wysyłane tym kanałem. Jeśli to pomyłka, skontaktuj się z administratorem.`;
}

export async function saveMessage(conversationId, role, content, commandUsed = null) {
  const { rows } = await query(
    'INSERT INTO messages (conversation_id, role, content, command_used) VALUES ($1, $2, $3, $4) RETURNING id',
    [conversationId, role, content, commandUsed],
  );
  return rows[0].id;
}

/** Persists uploaded files to disk and links them to the given message. */
export async function saveAttachments(messageId, attachments) {
  for (const file of attachments) {
    const storagePath = await saveAttachmentFile(file.buffer, file.filename);
    await query(
      `INSERT INTO message_attachments (message_id, filename, mime_type, size_bytes, storage_path)
       VALUES ($1, $2, $3, $4, $5)`,
      [messageId, file.filename, file.mimeType, file.sizeBytes, storagePath],
    );
  }
}

/**
 * Deletes messages matching `conversationId AND id <op> messageId` (`op` is
 * '>' for edit, '>=' for regenerate), first unlinking any attachment files
 * on disk for those messages — otherwise `ON DELETE CASCADE` only removes
 * the `message_attachments` rows and the files under `backend/uploads/`
 * are orphaned on every edit/regenerate of a message that had attachments.
 */
export async function deleteMessagesFrom(conversationId, op, messageId) {
  const { rows: toDelete } = await query(
    `SELECT id FROM messages WHERE conversation_id = $1 AND id ${op} $2`,
    [conversationId, messageId],
  );
  if (toDelete.length > 0) {
    const { rows: attachments } = await query(
      'SELECT storage_path FROM message_attachments WHERE message_id = ANY($1)',
      [toDelete.map((r) => r.id)],
    );
    await Promise.all(attachments.map((a) => deleteAttachmentFile(a.storage_path)));
  }
  await query(`DELETE FROM messages WHERE conversation_id = $1 AND id ${op} $2`, [conversationId, messageId]);
}

/** Reloads a previously-saved message's attachments from disk (used by regenerate/edit). */
async function loadMessageAttachments(messageId) {
  const { rows } = await query(
    'SELECT filename, mime_type, size_bytes, storage_path FROM message_attachments WHERE message_id = $1 ORDER BY id ASC',
    [messageId],
  );
  return Promise.all(
    rows.map(async (r) => ({
      buffer: await readAttachmentFile(r.storage_path),
      filename: r.filename,
      mimeType: r.mime_type,
      sizeBytes: r.size_bytes,
    })),
  );
}

/**
 * Loads prior turns for the conversation as Anthropic message params, so
 * each new call actually has memory of the conversation instead of treating
 * every message as a fresh, context-free request.
 * `beforeId`, when given, stops history before that message id (used by
 * regenerate/edit, which reconstruct history up to a specific point).
 */
/**
 * Collapses older messages that would otherwise be dropped into a single
 * short summary, via one cheap model call, so long conversations keep their
 * earlier context instead of losing it outright past the history cutoff.
 */
async function summarizeOlderMessages(olderRows) {
  const transcript = olderRows
    .map((r) => `${r.role === 'user' ? 'Użytkownik' : 'Asystent'}: ${r.content}`)
    .join('\n\n')
    .slice(0, 20_000);

  const client = await getAnthropicClient();
  const response = await client.messages.create({
    model: JUDGE_MODEL,
    max_tokens: 400,
    messages: [
      {
        role: 'user',
        content: `Podsumuj poniższy fragment rozmowy w kilku zdaniach po polsku, zachowując kluczowe fakty, decyzje i kontekst potrzebny do kontynuowania rozmowy. Nie dodawaj komentarzy, zwróć sam tekst podsumowania.\n\n${transcript}`,
      },
    ],
  });
  return response.content.find((b) => b.type === 'text')?.text?.trim() ?? '';
}

async function loadHistory(conversationId, { beforeId } = {}) {
  const { rows } = await query(
    beforeId
      ? 'SELECT id, role, content FROM messages WHERE conversation_id = $1 AND id < $2 ORDER BY id ASC'
      : 'SELECT id, role, content FROM messages WHERE conversation_id = $1 ORDER BY id ASC',
    beforeId ? [conversationId, beforeId] : [conversationId],
  );

  if (rows.length <= SUMMARY_THRESHOLD) {
    return rows.slice(-MAX_HISTORY_MESSAGES).map((r) => ({ role: r.role, content: r.content }));
  }

  let recentRows = rows.slice(-MAX_HISTORY_MESSAGES);
  // The pseudo-turns below end on 'assistant', so the kept window must start
  // on 'user' to keep strict user/assistant alternation for the API.
  const firstUserIndex = recentRows.findIndex((r) => r.role === 'user');
  if (firstUserIndex > 0) recentRows = recentRows.slice(firstUserIndex);
  const olderRows = rows.slice(0, rows.length - recentRows.length);
  let summary;
  try {
    summary = await summarizeOlderMessages(olderRows);
  } catch {
    // Best-effort: if summarization fails, fall back to the old hard cutoff
    // rather than blocking the turn.
    return recentRows.map((r) => ({ role: r.role, content: r.content }));
  }

  return [
    { role: 'user', content: `[Podsumowanie wcześniejszej części rozmowy]\n${summary}` },
    { role: 'assistant', content: 'Rozumiem, będę pamiętać ten kontekst.' },
    ...recentRows.map((r) => ({ role: r.role, content: r.content })),
  ];
}

async function maybeSetConversationTitle(conversationId, text) {
  const { rows } = await query(
    `SELECT (SELECT count(*)::int FROM messages WHERE conversation_id = $1) AS message_count`,
    [conversationId],
  );
  if (rows.length === 0 || Number(rows[0].message_count) > 0) return;
  const trimmed = text.trim();
  if (!trimmed) return;
  const title = trimmed.length > TITLE_MAX_LENGTH ? `${trimmed.slice(0, TITLE_MAX_LENGTH)}…` : trimmed;
  await query('UPDATE conversations SET title = $2 WHERE id = $1', [conversationId, title]);
}

/** Extracts plain text from a PDF buffer, truncated like the other inlined attachments. */
async function extractPdfText(buffer) {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text.slice(0, 20_000);
  } finally {
    await parser.destroy?.();
  }
}

/**
 * Builds the content sent to Claude for this turn: the text prompt, plus any
 * image attachments as vision blocks, plus any small text-file attachments
 * (and PDF text, extracted via pdf-parse) inlined as fenced text — Claude
 * has no other way to "see" a .txt/.csv/.pdf upload.
 */
async function buildPromptContent(promptText, attachments) {
  const images = attachments.filter((f) => isImageAttachment(f.mimeType));
  const textFiles = attachments.filter((f) => isTextAttachment(f.mimeType));
  const pdfFiles = attachments.filter((f) => isPdfAttachment(f.mimeType));

  let text = promptText;
  for (const file of textFiles) {
    text += `\n\n--- Załącznik: ${file.filename} ---\n${file.buffer.toString('utf-8').slice(0, 20_000)}`;
  }
  for (const file of pdfFiles) {
    let pdfText;
    try {
      pdfText = await extractPdfText(file.buffer);
    } catch (err) {
      pdfText = `[Nie udało się odczytać treści PDF: ${err.message}]`;
    }
    text += `\n\n--- Załącznik (PDF): ${file.filename} ---\n${pdfText}`;
  }

  if (images.length === 0) return text;

  return [
    { type: 'text', text },
    ...images.map((file) => ({
      type: 'image',
      source: { type: 'base64', media_type: file.mimeType, data: file.buffer.toString('base64') },
    })),
  ];
}

async function runToolLoop(client, messages, redaction, { model = CHAT_MODEL, system } = {}) {
  messages = stripOrphanedToolUses(messages);
  let response = await client.messages.create({
    model,
    max_tokens: 1024,
    tools: TOOLS,
    messages,
    ...(system ? { system } : {}),
  });

  let toolRounds = 0;
  while (response.stop_reason === 'tool_use') {
    if (++toolRounds > MAX_TOOL_ROUNDS) {
      throw new Error(`Tool-use loop exceeded ${MAX_TOOL_ROUNDS} rounds`);
    }
    const toolResults = await runAllToolUses(response.content, redaction);

    messages = stripOrphanedToolUses([
      ...messages,
      { role: 'assistant', content: stripThinkingBlocks(response.content) },
      { role: 'user', content: toolResults },
    ]);

    response = await client.messages.create({
      model,
      max_tokens: 1024,
      tools: TOOLS,
      messages,
      ...(system ? { system } : {}),
    });
  }

  return response;
}

/**
 * Same tool-use loop as `runToolLoop`, but calls Claude's streaming API and
 * forwards each text delta to `onChunk` as it arrives. If the model wants to
 * call the BigQuery tool, that round isn't streamed token-by-token (tool
 * calls don't produce user-facing text anyway); the round after the tool
 * result resumes streaming normally.
 */
async function runToolLoopStreaming(client, messages, redaction, onChunk, signal, { model = CHAT_MODEL, system } = {}) {
  let fullText = '';
  let usage = { input_tokens: 0, output_tokens: 0 };
  let toolRounds = 0;
  messages = stripOrphanedToolUses(messages);

  for (;;) {
    if (toolRounds > MAX_TOOL_ROUNDS) {
      throw new Error(`Tool-use loop exceeded ${MAX_TOOL_ROUNDS} rounds`);
    }
    const stream = client.messages.stream({
      model,
      max_tokens: 1024,
      tools: TOOLS,
      messages,
      ...(system ? { system } : {}),
    });
    if (signal) {
      if (signal.aborted) stream.abort();
      else signal.addEventListener('abort', () => stream.abort(), { once: true });
    }
    stream.on('text', (delta) => {
      fullText += delta;
      onChunk(delta);
    });

    let message;
    try {
      message = await stream.finalMessage();
    } catch (err) {
      if (stream.aborted) break;
      throw err;
    }

    usage = {
      input_tokens: usage.input_tokens + message.usage.input_tokens,
      output_tokens: usage.output_tokens + message.usage.output_tokens,
    };

    if (message.stop_reason !== 'tool_use') break;
    toolRounds += 1;

    const toolResults = await runAllToolUses(message.content, redaction);

    messages = stripOrphanedToolUses([
      ...messages,
      { role: 'assistant', content: stripThinkingBlocks(message.content) },
      { role: 'user', content: toolResults },
    ]);
  }

  return { text: fullText, usage };
}

async function finishAssistantReply({ conversationId, safeMessage, commandUsed, replyText, usage, latencyMs, model = CHAT_MODEL }) {
  const assistantMessageId = await saveMessage(conversationId, 'assistant', replyText, commandUsed);
  await recordUsage({
    messageId: assistantMessageId,
    model,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    latencyMs,
    commandUsed,
  });
  // Fire-and-forget: never block the user-facing reply on the judge call.
  judgeResponse({ messageId: assistantMessageId, userQuestion: safeMessage, assistantAnswer: replyText });
  return assistantMessageId;
}

/** Loads the per-conversation model override and system prompt, if set. */
async function getConversationSettings(conversationId) {
  const { rows } = await query('SELECT model, system_prompt FROM conversations WHERE id = $1', [conversationId]);
  return {
    model: rows[0]?.model || CHAT_MODEL,
    system: rows[0]?.system_prompt || undefined,
  };
}

/**
 * Runs local OCR over any image attachments and appends the extracted text
 * to the message text, so the sensitive-data precheck sees what's actually
 * in the photos, not just the typed prompt.
 */
async function buildPrecheckText(safeMessage, attachments) {
  const images = attachments.filter((f) => isImageAttachment(f.mimeType));
  if (images.length === 0) return safeMessage;
  const ocrText = await extractTextFromImages(images);
  return ocrText ? `${safeMessage}\n\n${ocrText}` : safeMessage;
}

/**
 * Classifies a draft message WITHOUT saving anything or calling the chat
 * model — used by the frontend to gate sending: żółta/czerwona surface the
 * block reason immediately, zielona still needs the user to confirm the
 * message contains none of that data before the real send proceeds.
 */
export async function classifyDraftMessage({ conversationId, userId, userMessage, attachments = [] }) {
  const terms = await getRedactionTerms();
  const session = createRedactionSession(terms);
  const safeMessage = session.redact(userMessage);
  const piiCategories = session.categories;
  const precheckText = await buildPrecheckText(safeMessage, attachments);
  const precheck = await precheckMessage({ conversationId, userMessage: precheckText });
  if (userId) {
    logAiAudit({ conversationId, userId, piiCategories, precheck, model: PRECHECK_MODEL, purpose: 'classify-draft' });
  }
  return {
    blocked: precheck.blocked,
    level: precheck.level,
    category: precheck.category,
    reply: precheck.blocked ? buildBlockedReply(precheck) : null,
  };
}

/**
 * Shared prep for a brand-new user turn: redaction, auto-title, hard-block
 * precheck, slash-command dispatch, conversation history load, and monthly
 * budget check. Returns either a finished result (bypass/blocked/over
 * budget — nothing left to do) or everything needed to call Claude.
 */
async function prepareNewTurn({ conversationId, userId, userMessage, attachments }) {
  const terms = await getRedactionTerms();
  const session = createRedactionSession(terms);
  const safeMessage = session.redact(userMessage);
  const piiCategories = session.categories;
  await maybeSetConversationTitle(conversationId, safeMessage);

  const precheckText = await buildPrecheckText(safeMessage, attachments);
  const precheck = await precheckMessage({ conversationId, userMessage: precheckText });
  logAiAudit({ conversationId, userId, piiCategories, precheck, model: PRECHECK_MODEL, purpose: 'precheck' });
  if (precheck.blocked) {
    const userMessageId = await saveMessage(conversationId, 'user', safeMessage);
    await saveAttachments(userMessageId, attachments);
    const blockedReply = buildBlockedReply(precheck);
    const assistantMessageId = await saveMessage(conversationId, 'assistant', blockedReply);
    return { done: true, result: { reply: blockedReply, messageId: assistantMessageId, commandUsed: null, blocked: true } };
  }

  // Fire-and-forget: flags ambiguous-but-worrying messages that didn't meet
  // the hard-block confidence threshold, without adding latency to the chat.
  detectUncertainLeak({ conversationId, userId, userMessage: precheckText });

  const parsed = parseCommand(safeMessage);
  let commandUsed = null;
  let promptForLlm = safeMessage;

  if (parsed) {
    commandUsed = parsed.name;
    const result = await dispatchCommand({ command: parsed.command, args: parsed.args, context: { conversationId } });
    if (result.mode === 'bypass') {
      const userMessageId = await saveMessage(conversationId, 'user', safeMessage);
      await saveAttachments(userMessageId, attachments);
      const assistantMessageId = await saveMessage(conversationId, 'assistant', result.reply);
      return { done: true, result: { reply: result.reply, messageId: assistantMessageId, commandUsed } };
    }
    promptForLlm = result.prompt;
  }

  // History must be captured before saving this turn's own user message.
  const history = await loadHistory(conversationId);

  const userMessageId = await saveMessage(conversationId, 'user', safeMessage);
  await saveAttachments(userMessageId, attachments);

  const budget = await checkMonthlyBudget();
  if (!budget.withinBudget) {
    const reply = `Osiągnięto miesięczny budżet pilotażu ($${budget.spent.toFixed(2)} / $${budget.limit.toFixed(2)}). Wiadomość nie została wysłana do modelu — skontaktuj się z administratorem.`;
    const assistantMessageId = await saveMessage(conversationId, 'assistant', reply, commandUsed);
    return { done: true, result: { reply, messageId: assistantMessageId, commandUsed } };
  }

  const settings = await getConversationSettings(conversationId);

  return {
    done: false,
    history,
    currentContent: await buildPromptContent(promptForLlm, attachments),
    commandUsed,
    safeMessage,
    session,
    settings,
  };
}

/** Non-streaming entry point for a brand-new user turn. */
export async function handleChatTurn({ conversationId, userId, userMessage, attachments = [] }) {
  const prep = await prepareNewTurn({ conversationId, userId, userMessage, attachments });
  if (prep.done) return prep.result;

  const client = await getAnthropicClient();
  const started = Date.now();
  const response = await runToolLoop(
    client,
    [...prep.history, { role: 'user', content: prep.currentContent }],
    prep.session,
    prep.settings,
  );
  const latencyMs = Date.now() - started;
  // Categories logged here (after the tool loop) include anything the
  // redaction session picked up from BigQuery/RAG tool results, not just
  // the specialist's own message.
  logAiAudit({
    conversationId,
    userId,
    piiCategories: prep.session.categories,
    model: prep.settings.model,
    purpose: prep.commandUsed ?? 'chat',
  });
  // Stored/DB copy stays tokenized (data minimization); only the copy
  // handed back to the specialist for this response is de-tokenized — the
  // real values were never sent to the model and are never persisted.
  const replyText = response.content.find((b) => b.type === 'text')?.text ?? '';
  const assistantMessageId = await finishAssistantReply({
    conversationId,
    safeMessage: prep.safeMessage,
    commandUsed: prep.commandUsed,
    replyText,
    usage: response.usage,
    latencyMs,
    model: prep.settings.model,
  });
  return { reply: prep.session.restore(replyText), messageId: assistantMessageId, commandUsed: prep.commandUsed };
}

/** Streaming entry point for a brand-new user turn (`onChunk` gets each text delta). */
export async function streamChatTurn({ conversationId, userId, userMessage, attachments = [], onChunk, signal }) {
  const prep = await prepareNewTurn({ conversationId, userId, userMessage, attachments });
  if (prep.done) return prep.result;

  const client = await getAnthropicClient();
  const started = Date.now();
  // Chunks reach the browser de-tokenized live; the accumulated `text` used
  // for DB storage/judging below stays tokenized — see restorePii's docstring.
  // The chunker reads prep.session.map live, so tokens discovered in a
  // BigQuery/RAG tool result mid-stream still get de-tokenized correctly.
  const chunker = prep.session.createChunker(onChunk);
  const { text, usage } = await runToolLoopStreaming(
    client,
    [...prep.history, { role: 'user', content: prep.currentContent }],
    prep.session,
    (delta) => chunker.push(delta),
    signal,
    prep.settings,
  );
  chunker.flush();
  const latencyMs = Date.now() - started;
  logAiAudit({
    conversationId,
    userId,
    piiCategories: prep.session.categories,
    model: prep.settings.model,
    purpose: prep.commandUsed ?? 'chat',
  });
  const assistantMessageId = await finishAssistantReply({
    conversationId,
    safeMessage: prep.safeMessage,
    commandUsed: prep.commandUsed,
    replyText: text,
    usage,
    latencyMs,
    model: prep.settings.model,
  });
  return { reply: prep.session.restore(text), messageId: assistantMessageId, commandUsed: prep.commandUsed };
}

/**
 * Shared core for regenerate and edit: given a user message that already
 * exists in the DB (unchanged for regenerate, just-edited for edit), re-runs
 * precheck/slash-command/budget logic and streams a fresh assistant reply
 * for it. Does NOT save a new user message or touch the auto-title — both
 * only make sense for a brand-new turn.
 */
export async function continueFromUserMessage({ conversationId, userId, userMessageId, onChunk, signal }) {
  const { rows } = await query(
    'SELECT content FROM messages WHERE id = $1 AND conversation_id = $2 AND role = $3',
    [userMessageId, conversationId, 'user'],
  );
  if (rows.length === 0) throw Object.assign(new Error('User message not found'), { status: 404 });
  const safeMessage = rows[0].content;
  const attachments = await loadMessageAttachments(userMessageId);

  const terms = await getRedactionTerms();
  const session = createRedactionSession(terms);

  const precheckText = await buildPrecheckText(safeMessage, attachments);
  const precheck = await precheckMessage({ conversationId, userMessage: precheckText });
  // safeMessage here is already-tokenized text re-read from the DB (redactPii
  // ran once, at the original send) — no new PII categories to detect in it.
  // `session` still exists to redact anything a BigQuery/RAG tool call
  // returns below; the response on this path stays tokenized either way
  // (no map to restore from for the original message).
  logAiAudit({ conversationId, userId, piiCategories: [], precheck, model: PRECHECK_MODEL, purpose: 'precheck' });
  if (precheck.blocked) {
    const blockedReply = buildBlockedReply(precheck);
    const assistantMessageId = await saveMessage(conversationId, 'assistant', blockedReply);
    return { reply: blockedReply, messageId: assistantMessageId, commandUsed: null, blocked: true };
  }

  detectUncertainLeak({ conversationId, userId, userMessage: precheckText });

  const parsed = parseCommand(safeMessage);
  let commandUsed = null;
  let promptForLlm = safeMessage;
  if (parsed) {
    commandUsed = parsed.name;
    const result = await dispatchCommand({ command: parsed.command, args: parsed.args, context: { conversationId } });
    if (result.mode === 'bypass') {
      const assistantMessageId = await saveMessage(conversationId, 'assistant', result.reply, commandUsed);
      return { reply: result.reply, messageId: assistantMessageId, commandUsed };
    }
    promptForLlm = result.prompt;
  }

  const budget = await checkMonthlyBudget();
  if (!budget.withinBudget) {
    const reply = `Osiągnięto miesięczny budżet pilotażu ($${budget.spent.toFixed(2)} / $${budget.limit.toFixed(2)}). Wiadomość nie została wysłana do modelu — skontaktuj się z administratorem.`;
    const assistantMessageId = await saveMessage(conversationId, 'assistant', reply, commandUsed);
    return { reply, messageId: assistantMessageId, commandUsed };
  }

  const history = await loadHistory(conversationId, { beforeId: userMessageId });
  const currentContent = await buildPromptContent(promptForLlm, attachments);
  const settings = await getConversationSettings(conversationId);

  const client = await getAnthropicClient();
  const started = Date.now();
  const { text, usage } = await runToolLoopStreaming(
    client,
    [...history, { role: 'user', content: currentContent }],
    session,
    onChunk,
    signal,
    settings,
  );
  const latencyMs = Date.now() - started;
  logAiAudit({
    conversationId,
    userId,
    piiCategories: session.categories,
    precheck,
    model: settings.model,
    purpose: commandUsed ?? 'chat',
  });
  const assistantMessageId = await finishAssistantReply({
    conversationId,
    safeMessage,
    commandUsed,
    replyText: text,
    usage,
    model: settings.model,
    latencyMs,
  });
  return { reply: text, messageId: assistantMessageId, commandUsed };
}
