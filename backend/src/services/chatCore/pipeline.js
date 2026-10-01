import { chatCompletion, streamChatCompletion, completeText, OLLAMA_MODEL } from '../ollamaClient.js';
import { bigQueryTool, runBigQueryTool, isBigQueryConfigured } from '../mcp/bigqueryServer.js';
import { knowledgeSearchTool, runKnowledgeSearchTool } from '../mcp/knowledgeServer.js';
import { recordUsage } from '../metrics/usageTracker.js';
import { parseCommand, dispatchCommand, ARTIFACT_COMMANDS } from './slashDispatch.js';
import { extractArtifact } from './artifactExtract.js';
import { createRedactionSession } from '../security/piiRedaction.js';
import { getRedactionTerms } from '../security/redactionTerms.js';
import { precheckMessage, PRECHECK_MODEL } from '../security/sensitiveDataPrecheck.js';
import { extractTextFromImages } from '../security/ocrExtraction.js';
import { detectUncertainLeak } from '../security/uncertainLeakAgent.js';
import { logAiAudit } from '../security/aiAuditLog.js';
import { logger } from '../../config/logger.js';
import { checkMonthlyBudget } from '../../config/budget.js';
import { query } from '../../config/db.js';
import {
  saveAttachmentFile,
  readAttachmentFile,
  deleteAttachmentFile,
  isTextAttachment,
  isPdfAttachment,
  isDocxAttachment,
  isXlsxAttachment,
  isPptxAttachment,
} from '../attachments/attachmentStore.js';
import { extractPdfText, extractDocxText, extractXlsxText, extractPptxText } from '../attachments/textExtraction.js';

const CHAT_MODEL = process.env.OLLAMA_MODEL ?? OLLAMA_MODEL;
// Only offer the BigQuery tool once it's actually configured (an allowlisted
// table exists) — otherwise every call the model makes fails closed, and it
// burns through the tool-use round limit retrying instead of just answering.
const TOOLS = [...(isBigQueryConfigured() ? [bigQueryTool] : []), knowledgeSearchTool];

async function runTool(toolCall, signal) {
  if (signal?.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
  if (toolCall.name === 'query_bigquery') return runBigQueryTool(toolCall.input, signal);
  if (toolCall.name === 'search_knowledge_base') return runKnowledgeSearchTool(toolCall.input);
  throw new Error(`Unknown tool: ${toolCall.name}`);
}

const MAX_HISTORY_MESSAGES = 20;
// Once history grows past this many messages, everything older than the
// last MAX_HISTORY_MESSAGES gets collapsed into one summary turn instead of
// being dropped outright — keeps long conversations coherent without
// sending the whole transcript on every request.
const SUMMARY_THRESHOLD = 30;
const MAX_TOOL_ROUNDS = 8;

/**
 * Runs every tool call the model asked for in one round and returns one
 * `tool` message per call, matched by name+id, each redacted the same way a
 * pasted-in prompt would be — BigQuery/RAG results can carry the same raw
 * client names, budgets, and PII a user prompt can, and without this they'd
 * reach the model (and, on the way back, the specialist) unredacted.
 */
async function runAllToolCalls(toolCalls, redaction, signal) {
  return Promise.all(
    toolCalls.map(async (toolCall) => {
      let result;
      try {
        result = await runTool(toolCall, signal);
      } catch (err) {
        result = { error: err.message };
      }
      const redactedContent = redaction.redact(JSON.stringify(result));
      return { role: 'tool', content: redactedContent, name: toolCall.name };
    }),
  );
}

const TITLE_MAX_LENGTH = 60;

/** Builds the user-facing block message, naming the classification level and reason. */
function buildBlockedReply(precheck) {
  const levelLabel = precheck.level === 'czerwona' ? 'CZERWONA' : 'ŻÓŁTA';
  const reason = precheck.rationale ? ` Powód: ${precheck.rationale}.` : '';
  return `Ta wiadomość została zablokowana przez automatyczną kontrolę bezpieczeństwa danych — sklasyfikowano ją jako ${levelLabel} (kategoria: ${precheck.category ?? 'nieokreślona'}).${reason} Jeśli to pomyłka, skontaktuj się z administratorem.`;
}

/** Builds the user-facing message when checkMonthlyBudget() blocks a turn, naming whichever cap (org or per-user) was hit. */
function buildBudgetExceededReply(budget) {
  if (budget.scope === 'user') {
    return `Osiągnięto Twój miesięczny limit kosztów ($${budget.spent.toFixed(2)} / $${budget.limit.toFixed(2)}). Wiadomość nie została wysłana do modelu — skontaktuj się z administratorem, jeśli potrzebujesz wyższego limitu.`;
  }
  return `Osiągnięto miesięczny budżet pilotażu ($${budget.spent.toFixed(2)} / $${budget.limit.toFixed(2)}). Wiadomość nie została wysłana do modelu — skontaktuj się z administratorem.`;
}

/**
 * Guards every persistence entry point against writing on behalf of a
 * conversation that doesn't belong to `userId` — callers upstream (routes)
 * already scope by user, but `pipeline.js` itself had no check of its own,
 * so a bypassed/misconfigured auth middleware could still trigger a write
 * with an unverified userId. Throws (404, so as not to reveal whether the
 * conversation exists for someone else) if there's no matching row.
 */
async function assertConversationOwner(conversationId, userId) {
  if (!userId) throw Object.assign(new Error('Conversation not found'), { status: 404 });
  const { rows } = await query('SELECT 1 FROM conversations WHERE id = $1 AND user_id = $2', [conversationId, userId]);
  if (rows.length === 0) throw Object.assign(new Error('Conversation not found'), { status: 404 });
}

export async function saveMessage(conversationId, role, content, commandUsed = null, citations = null, generatedFiles = null) {
  const { rows } = await query(
    'INSERT INTO messages (conversation_id, role, content, command_used, citations, generated_files) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [conversationId, role, content, commandUsed, citations ? JSON.stringify(citations) : null, generatedFiles ? JSON.stringify(generatedFiles) : null],
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
  if (toDelete.length === 0) return;

  const { rows: attachments } = await query(
    'SELECT DISTINCT storage_path FROM message_attachments WHERE message_id = ANY($1)',
    [toDelete.map((r) => r.id)],
  );

  await query(`DELETE FROM messages WHERE conversation_id = $1 AND id ${op} $2`, [conversationId, messageId]);

  // Branching a conversation copies attachment rows by storage_path instead
  // of duplicating the file on disk, so a shared file must only be deleted
  // once no message (in any conversation) still points at it.
  await deleteUnreferencedAttachmentFiles(attachments.map((a) => a.storage_path));
}

/** Deletes each storage path that no `message_attachments` row references any more. */
async function deleteUnreferencedAttachmentFiles(storagePaths) {
  await Promise.all(
    storagePaths.map(async (storagePath) => {
      const { rows } = await query('SELECT 1 FROM message_attachments WHERE storage_path = $1 LIMIT 1', [storagePath]);
      if (rows.length === 0) await deleteAttachmentFile(storagePath);
    }),
  );
}

/**
 * Branches a conversation from a given message: creates a new conversation
 * that starts as an exact copy of every message up to and including
 * `messageId` (same model/system prompt), so the specialist can explore a
 * different direction from that point without losing or mutating the
 * original thread. Attachments are copied by reference (same storage_path,
 * a new `message_attachments` row) rather than duplicated on disk.
 */
export async function branchConversation({ conversationId, userId, messageId }) {
  const { rows: convRows } = await query(
    'SELECT title, model, system_prompt FROM conversations WHERE id = $1 AND user_id = $2',
    [conversationId, userId],
  );
  if (convRows.length === 0) throw new Error('Conversation not found');
  const source = convRows[0];

  const { rows: messageRows } = await query(
    'SELECT id FROM messages WHERE conversation_id = $1 AND id = $2',
    [conversationId, messageId],
  );
  if (messageRows.length === 0) throw new Error('Message not found');

  const { rows: toCopy } = await query(
    'SELECT id, role, content, command_used, citations, generated_files, created_at FROM messages WHERE conversation_id = $1 AND id <= $2 ORDER BY id ASC',
    [conversationId, messageId],
  );

  const branchTitle = `${source.title?.trim() || 'Rozmowa'} (gałąź)`;
  const { rows: newConvRows } = await query(
    `INSERT INTO conversations (user_id, title, model, system_prompt, branched_from_conversation_id, branched_from_message_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, title, created_at, model, system_prompt`,
    [userId, branchTitle, source.model, source.system_prompt, conversationId, messageId],
  );
  const newConversation = newConvRows[0];

  for (const message of toCopy) {
    const { rows: insertedRows } = await query(
      'INSERT INTO messages (conversation_id, role, content, command_used, citations, generated_files, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [
        newConversation.id,
        message.role,
        message.content,
        message.command_used,
        message.citations,
        message.generated_files,
        message.created_at,
      ],
    );
    const newMessageId = insertedRows[0].id;
    await query(
      `INSERT INTO message_attachments (message_id, filename, mime_type, size_bytes, storage_path)
       SELECT $1, filename, mime_type, size_bytes, storage_path FROM message_attachments WHERE message_id = $2`,
      [newMessageId, message.id],
    );
  }

  return { ...newConversation, systemPrompt: newConversation.system_prompt };
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
 * Collapses older messages that would otherwise be dropped into a single
 * short summary, via one cheap model call, so long conversations keep their
 * earlier context instead of losing it outright past the history cutoff.
 */
async function summarizeOlderMessages(olderRows) {
  const transcript = olderRows
    .map((r) => `${r.role === 'user' ? 'Użytkownik' : 'Asystent'}: ${r.content}`)
    .join('\n\n')
    .slice(0, 20_000);

  const { text } = await completeText({
    prompt: `Podsumuj poniższy fragment rozmowy w kilku zdaniach po polsku, zachowując kluczowe fakty, decyzje i kontekst potrzebny do kontynuowania rozmowy. Nie dodawaj komentarzy, zwróć sam tekst podsumowania.\n\n${transcript}`,
  });
  return text.trim();
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
  // on 'user' to keep strict user/assistant alternation.
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

async function maybeSetConversationTitle(conversationId, text, attachments = []) {
  const { rows } = await query(
    `SELECT (SELECT count(*)::int FROM messages WHERE conversation_id = $1) AS message_count`,
    [conversationId],
  );
  if (rows.length === 0 || Number(rows[0].message_count) > 0) return;
  const trimmed = text.trim();
  // A first turn that's just an attachment (no typed text) has nothing to
  // title from — without this fallback the conversation stays "Nowa
  // rozmowa" forever, since this only ever runs once, on message_count === 0.
  const fallback = attachments[0]?.filename ?? attachments[0]?.name;
  const source = trimmed || fallback;
  if (!source) return;
  const title = source.length > TITLE_MAX_LENGTH ? `${source.slice(0, TITLE_MAX_LENGTH)}…` : source;
  await query('UPDATE conversations SET title = $2 WHERE id = $1', [conversationId, title]);
}

/**
 * Builds the text sent to the model for this turn: the typed prompt, plus
 * any small text-file attachments (PDF, docx, xlsx, pptx text, extracted
 * via the libraries above) inlined as fenced text. Image attachments are
 * noted by filename only — llama3.1 is a text-only model with no vision
 * input, unlike the Claude models this app used to run on.
 */
async function buildPromptContent(promptText, attachments) {
  const images = attachments.filter((f) => f.mimeType?.startsWith('image/'));
  const textFiles = attachments.filter((f) => isTextAttachment(f.mimeType));
  const pdfFiles = attachments.filter((f) => isPdfAttachment(f.mimeType));
  const docxFiles = attachments.filter((f) => isDocxAttachment(f.mimeType));
  const xlsxFiles = attachments.filter((f) => isXlsxAttachment(f.mimeType));
  const pptxFiles = attachments.filter((f) => isPptxAttachment(f.mimeType));

  let text = promptText;
  for (const file of images) {
    text += `\n\n[Załączono obraz: ${file.filename} — ten model jest tekstowy i nie może go zobaczyć.]`;
  }
  for (const file of textFiles) {
    text += `\n\n--- Załącznik: ${file.filename} ---\n${file.buffer.toString('utf-8').slice(0, 20_000)}`;
  }
  for (const file of docxFiles) {
    let docxText;
    try {
      docxText = await extractDocxText(file.buffer);
    } catch (err) {
      docxText = `[Nie udało się odczytać treści dokumentu Word: ${err.message}]`;
    }
    text += `\n\n--- Załącznik (Word): ${file.filename} ---\n${docxText}`;
  }
  for (const file of xlsxFiles) {
    let xlsxText;
    try {
      xlsxText = await extractXlsxText(file.buffer);
    } catch (err) {
      xlsxText = `[Nie udało się odczytać treści arkusza Excel: ${err.message}]`;
    }
    text += `\n\n--- Załącznik (Excel): ${file.filename} ---\n${xlsxText}`;
  }
  for (const file of pptxFiles) {
    let pptxText;
    try {
      pptxText = await extractPptxText(file.buffer);
    } catch (err) {
      pptxText = `[Nie udało się odczytać treści prezentacji PowerPoint: ${err.message}]`;
    }
    text += `\n\n--- Załącznik (PowerPoint): ${file.filename} ---\n${pptxText}`;
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

  return text;
}

/**
 * Non-streaming tool-use loop: calls Ollama, runs any tool calls it asked
 * for, feeds the results back as `tool` messages, and repeats until it
 * replies with plain text (or the round limit is hit).
 */
async function runToolLoop(messages, redaction, { model = CHAT_MODEL, system } = {}) {
  let toolRounds = 0;
  let result = await chatCompletion({ model, messages, system, tools: TOOLS });

  while (result.toolCalls.length > 0) {
    if (++toolRounds > MAX_TOOL_ROUNDS) {
      throw new Error(`Tool-use loop exceeded ${MAX_TOOL_ROUNDS} rounds`);
    }
    const toolMessages = await runAllToolCalls(result.toolCalls, redaction);
    messages = [...messages, { role: 'assistant', content: result.content }, ...toolMessages];
    result = await chatCompletion({ model, messages, system, tools: TOOLS });
  }

  return result;
}

/**
 * Streaming variant of the tool-use loop. A round that ends in tool calls
 * isn't streamed token-by-token (tool calls don't produce user-facing text
 * anyway); the round after the tool results resumes streaming normally.
 */
async function runToolLoopStreaming(messages, redaction, onChunk, signal, { model = CHAT_MODEL, system } = {}) {
  let fullText = '';
  let usage = { input_tokens: 0, output_tokens: 0 };
  let toolRounds = 0;

  for (;;) {
    if (toolRounds > MAX_TOOL_ROUNDS) {
      throw new Error(`Tool-use loop exceeded ${MAX_TOOL_ROUNDS} rounds`);
    }

    let result;
    try {
      result = await streamChatCompletion({
        model,
        messages,
        system,
        tools: TOOLS,
        onDelta: (delta) => {
          fullText += delta;
          onChunk(delta);
        },
        signal,
      });
    } catch (err) {
      if (signal?.aborted) break;
      throw err;
    }

    usage = { input_tokens: usage.input_tokens + result.usage.input_tokens, output_tokens: usage.output_tokens + result.usage.output_tokens };

    if (result.toolCalls.length === 0) break;
    toolRounds += 1;

    const toolMessages = await runAllToolCalls(result.toolCalls, redaction, signal);
    messages = [...messages, { role: 'assistant', content: result.content }, ...toolMessages];
  }

  return { text: fullText, usage };
}

async function finishAssistantReply({ conversationId, commandUsed, replyText, usage, latencyMs, model = CHAT_MODEL }) {
  const assistantMessageId = await saveMessage(conversationId, 'assistant', replyText, commandUsed);
  await recordUsage({
    messageId: assistantMessageId,
    model,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    latencyMs,
    commandUsed,
  });
  const artifactId = await maybeCreateArtifact({ conversationId, messageId: assistantMessageId, commandUsed, replyText });
  return { assistantMessageId, artifactId };
}

/**
 * Materializes a deliverable slash command's reply as a persisted, versioned
 * `artifacts` row (title from ARTIFACT_COMMANDS, type/preview auto-detected
 * via extractArtifact) — the frontend's artifact panel then reads/edits it
 * by id instead of re-deriving it from the message's raw content on render.
 */
async function maybeCreateArtifact({ conversationId, messageId, commandUsed, replyText }) {
  const title = commandUsed && ARTIFACT_COMMANDS[commandUsed];
  if (!title) return null;
  const { type, previewContent } = extractArtifact(replyText);
  const { rows } = await query(
    `INSERT INTO artifacts (conversation_id, message_id, command_used, title, type)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [conversationId, messageId, commandUsed, title, type],
  );
  const artifactId = rows[0].id;
  await query(
    `INSERT INTO artifact_versions (artifact_id, version, content, preview_content)
     VALUES ($1, 1, $2, $3)`,
    [artifactId, replyText, previewContent],
  );
  return artifactId;
}

/**
 * Loads the per-conversation model override and system prompt, if set, plus
 * the owning user's default system prompt (role/context, set once in their
 * settings and applied to every conversation) and, if the conversation
 * belongs to a project, that project's own instructions. Effective system
 * prompt is built in order global (user default) -> project -> style ->
 * conversation-specific, so a specialist's personal context always applies,
 * project instructions add shared context for everything grouped under it,
 * and per-chat text is the most specific layer on top.
 */
export const STYLE_PRESETS = {
  concise: {
    label: 'Zwięzły',
    instruction: 'Odpowiadaj maksymalnie zwięźle i na temat, bez zbędnych dygresji i powtórzeń.',
  },
  formal: {
    label: 'Formalny',
    instruction: 'Odpowiadaj w formalnym, profesjonalnym tonie, unikaj potocznego języka i emoji.',
  },
  creative: {
    label: 'Kreatywny',
    instruction: 'Odpowiadaj w swobodny, kreatywny sposób — śmiało proponuj nietypowe ujęcia i przykłady.',
  },
};

async function getConversationSettings(conversationId) {
  const { rows } = await query(
    `SELECT c.model, c.system_prompt, c.style, u.default_system_prompt, p.system_prompt AS project_system_prompt
     FROM conversations c
     JOIN users u ON u.id = c.user_id
     LEFT JOIN projects p ON p.id = c.project_id
     WHERE c.id = $1`,
    [conversationId],
  );
  const styleInstruction = STYLE_PRESETS[rows[0]?.style]?.instruction;
  const system = [rows[0]?.default_system_prompt, rows[0]?.project_system_prompt, styleInstruction, rows[0]?.system_prompt]
    .filter(Boolean)
    .join('\n\n') || undefined;
  return { model: rows[0]?.model || CHAT_MODEL, system };
}

/**
 * Loads this conversation's persisted PII/client-name token map and
 * per-category counters, so a new redaction session continues numbering
 * (`[KLIENT_7]`, not a restarted `[KLIENT_1]`) instead of colliding with
 * tokens already saved into this conversation's message history.
 */
// Serializes the load->redact->save cycle for a single conversation's
// redaction_state (token map + per-category counters). Without this, two
// concurrent turns on the same conversation (e.g. edit + regenerate) each
// load the same base state, mint tokens independently, and the one that
// saves last silently wins — corrupting the token map for anything already
// persisted under the other turn's tokens.
const conversationLocks = new Map();
function withConversationLock(conversationId, fn) {
  const previous = conversationLocks.get(conversationId) ?? Promise.resolve();
  const next = previous.then(fn, fn);
  const settled = next.catch(() => {});
  conversationLocks.set(conversationId, settled);
  settled.finally(() => {
    if (conversationLocks.get(conversationId) === settled) conversationLocks.delete(conversationId);
  });
  return next;
}

async function loadRedactionState(conversationId) {
  const { rows } = await query('SELECT redaction_state FROM conversations WHERE id = $1', [conversationId]);
  return rows[0]?.redaction_state ?? {};
}

/** Persists a redaction session's current map/counters back onto the conversation. */
async function saveRedactionState(conversationId, session) {
  await query('UPDATE conversations SET redaction_state = $2 WHERE id = $1', [
    conversationId,
    JSON.stringify({ map: session.map, counts: session.counts }),
  ]);
}

/**
 * Runs local OCR over any image attachments and appends the extracted text
 * to the message text, so the sensitive-data precheck sees what's actually
 * in the photos, not just the typed prompt.
 */
async function buildPrecheckText(safeMessage, attachments) {
  const images = attachments.filter((f) => f.mimeType?.startsWith('image/'));
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
 * Rough estimate of this turn's input size. Ollama has no free token-count
 * endpoint (unlike Anthropic's `countTokens`), so this uses a standard
 * ~4-characters-per-token heuristic over the prompt plus loaded history —
 * good enough to show the specialist an approximate size, not an exact
 * billable count (there's no cost with a local model anyway).
 */
export async function estimateTurnCost({ conversationId, draftText }) {
  const trimmed = (draftText ?? '').trim();
  if (!trimmed) return { inputTokens: 0, model: CHAT_MODEL };

  const [history, settings] = await Promise.all([loadHistory(conversationId), getConversationSettings(conversationId)]);
  const chars = trimmed.length + (settings.system?.length ?? 0) + history.reduce((acc, m) => acc + String(m.content).length, 0);
  return { inputTokens: Math.ceil(chars / 4), model: settings.model };
}

/**
 * Shared prep for a brand-new user turn: redaction, auto-title, hard-block
 * precheck, slash-command dispatch, conversation history load, and monthly
 * budget check. Returns either a finished result (bypass/blocked/over
 * budget — nothing left to do) or everything needed to call the model.
 */
async function prepareNewTurn({ conversationId, userId, userMessage, attachments, overrideBlock = false }) {
  await assertConversationOwner(conversationId, userId);
  const terms = await getRedactionTerms();
  const redactionState = await loadRedactionState(conversationId);
  const session = createRedactionSession(terms, redactionState);
  const safeMessage = session.redact(userMessage);
  const piiCategories = session.categories;
  // Persist right after tokenizing the incoming message (before any early
  // return below) so every path that saves `safeMessage` to `messages` has
  // already reserved its tokens against this conversation's running counters.
  await saveRedactionState(conversationId, session);
  await maybeSetConversationTitle(conversationId, safeMessage, attachments);

  const precheckText = await buildPrecheckText(safeMessage, attachments);
  const precheck = await precheckMessage({ conversationId, userMessage: precheckText });
  if (precheck.blocked && !overrideBlock) {
    logAiAudit({ conversationId, userId, piiCategories, precheck, model: PRECHECK_MODEL, purpose: 'precheck' });
    const userMessageId = await saveMessage(conversationId, 'user', safeMessage);
    await saveAttachments(userMessageId, attachments);
    const blockedReply = buildBlockedReply(precheck);
    const assistantMessageId = await saveMessage(conversationId, 'assistant', blockedReply);
    return { done: true, result: { reply: blockedReply, messageId: assistantMessageId, commandUsed: null, blocked: true } };
  }
  if (precheck.blocked && overrideBlock) {
    // The specialist explicitly clicked through the żółta/czerwona warning —
    // this is a deliberate policy exception, not a normal turn, so it gets
    // its own loud log line and a distinct audit `purpose` instead of being
    // indistinguishable from an ordinary allowed message.
    logger.warn('Sensitive data pre-check block overridden by user', {
      conversationId,
      userId,
      level: precheck.level,
      category: precheck.category,
    });
  }
  logAiAudit({ conversationId, userId, piiCategories, precheck, model: PRECHECK_MODEL, purpose: precheck.blocked ? 'precheck-override' : 'precheck' });

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

  const budget = await checkMonthlyBudget(userId);
  if (!budget.withinBudget) {
    const reply = buildBudgetExceededReply(budget);
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
export async function handleChatTurn(args) {
  return withConversationLock(args.conversationId, () => handleChatTurnImpl(args));
}

async function handleChatTurnImpl({ conversationId, userId, userMessage, attachments = [], overrideBlock = false }) {
  const prep = await prepareNewTurn({ conversationId, userId, userMessage, attachments, overrideBlock });
  if (prep.done) return prep.result;

  const started = Date.now();
  const result = await runToolLoop(
    [...prep.history, { role: 'user', content: prep.currentContent }],
    prep.session,
    prep.settings,
  );
  const latencyMs = Date.now() - started;
  logAiAudit({
    conversationId,
    userId,
    piiCategories: prep.session.categories,
    model: prep.settings.model,
    purpose: prep.commandUsed ?? 'chat',
  });
  const replyText = result.content;
  const { assistantMessageId, artifactId } = await finishAssistantReply({
    conversationId,
    commandUsed: prep.commandUsed,
    replyText,
    usage: result.usage,
    latencyMs,
    model: prep.settings.model,
  });
  // Tool results (BigQuery/RAG) can mint additional tokens mid-turn — persist
  // the session's final state so the next turn's counters continue from here.
  await saveRedactionState(conversationId, prep.session);
  return {
    reply: prep.session.restore(replyText),
    messageId: assistantMessageId,
    commandUsed: prep.commandUsed,
    artifactId,
  };
}

/** Streaming entry point for a brand-new user turn (`onChunk` gets each text delta). */
export async function streamChatTurn(args) {
  return withConversationLock(args.conversationId, () => streamChatTurnImpl(args));
}

async function streamChatTurnImpl({ conversationId, userId, userMessage, attachments = [], onChunk, signal, overrideBlock = false }) {
  const prep = await prepareNewTurn({ conversationId, userId, userMessage, attachments, overrideBlock });
  if (prep.done) return prep.result;

  const started = Date.now();
  // Chunks reach the browser de-tokenized live; the accumulated `text` used
  // for DB storage below stays tokenized — see restorePii's docstring.
  // The chunker reads prep.session.map live, so tokens discovered in a
  // BigQuery/RAG tool result mid-stream still get de-tokenized correctly.
  const chunker = prep.session.createChunker(onChunk);
  const { text, usage } = await runToolLoopStreaming(
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
  const { assistantMessageId, artifactId } = await finishAssistantReply({
    conversationId,
    commandUsed: prep.commandUsed,
    replyText: text,
    usage,
    latencyMs,
    model: prep.settings.model,
  });
  await saveRedactionState(conversationId, prep.session);
  return {
    reply: prep.session.restore(text),
    messageId: assistantMessageId,
    commandUsed: prep.commandUsed,
    artifactId,
  };
}

/**
 * Shared core for regenerate and edit: given a user message that already
 * exists in the DB (unchanged for regenerate, just-edited for edit), re-runs
 * precheck/slash-command/budget logic and streams a fresh assistant reply
 * for it. Does NOT save a new user message or touch the auto-title — both
 * only make sense for a brand-new turn.
 */
export async function continueFromUserMessage(args) {
  return withConversationLock(args.conversationId, () => continueFromUserMessageImpl(args));
}

async function continueFromUserMessageImpl({ conversationId, userId, userMessageId, onChunk, signal }) {
  await assertConversationOwner(conversationId, userId);
  const { rows } = await query(
    'SELECT content FROM messages WHERE id = $1 AND conversation_id = $2 AND role = $3',
    [userMessageId, conversationId, 'user'],
  );
  if (rows.length === 0) throw Object.assign(new Error('User message not found'), { status: 404 });
  const safeMessage = rows[0].content;
  const attachments = await loadMessageAttachments(userMessageId);

  const terms = await getRedactionTerms();
  const redactionState = await loadRedactionState(conversationId);
  const session = createRedactionSession(terms, redactionState);

  const precheckText = await buildPrecheckText(safeMessage, attachments);
  const precheck = await precheckMessage({ conversationId, userMessage: precheckText });
  // safeMessage here is already-tokenized text re-read from the DB (redactPii
  // ran once, at the original send) — no new PII categories to detect in it.
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

  const budget = await checkMonthlyBudget(userId);
  if (!budget.withinBudget) {
    const reply = buildBudgetExceededReply(budget);
    const assistantMessageId = await saveMessage(conversationId, 'assistant', reply, commandUsed);
    return { reply, messageId: assistantMessageId, commandUsed };
  }

  const history = await loadHistory(conversationId, { beforeId: userMessageId });
  const currentContent = await buildPromptContent(promptForLlm, attachments);
  const settings = await getConversationSettings(conversationId);

  const started = Date.now();
  const { text, usage } = await runToolLoopStreaming(
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
  const { assistantMessageId, artifactId } = await finishAssistantReply({
    conversationId,
    commandUsed,
    replyText: text,
    usage,
    model: settings.model,
    latencyMs,
  });
  await saveRedactionState(conversationId, session);
  return { reply: text, messageId: assistantMessageId, commandUsed, artifactId };
}
