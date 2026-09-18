import { getAnthropicClient, estimateCostUsd } from '../anthropicClient.js';
import { bigQueryTool, runBigQueryTool, isBigQueryConfigured } from '../mcp/bigqueryServer.js';
import { knowledgeSearchTool, runKnowledgeSearchTool } from '../mcp/knowledgeServer.js';
import { webSearchTool } from '../mcp/webSearchTool.js';
import { subAgentTool, runSubAgentTool } from '../mcp/subAgentTool.js';
import { codeExecutionTool, CODE_EXECUTION_BETA, FILES_API_BETA } from '../mcp/codeExecutionTool.js';
import { getEnabledMcpServers, MCP_CLIENT_BETA } from '../mcp/mcpConnectors.js';
import { memoryTool, runMemoryTool, MEMORY_SYSTEM_INSTRUCTION } from '../mcp/memoryTool.js';
import { recordUsage } from '../metrics/usageTracker.js';
import { judgeResponse } from '../judge/qualityJudge.js';
import { parseCommand, dispatchCommand } from './slashDispatch.js';
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
  isImageAttachment,
  isTextAttachment,
  isPdfAttachment,
  isDocxAttachment,
  isXlsxAttachment,
  isPptxAttachment,
} from '../attachments/attachmentStore.js';

const CHAT_MODEL = process.env.CHAT_MODEL ?? 'claude-sonnet-5';
const JUDGE_MODEL = process.env.JUDGE_MODEL ?? 'claude-haiku-4-5-20251001';
// Only offer the BigQuery tool once it's actually configured (an allowlisted
// table exists) — otherwise every call the model makes fails closed, and it
// burns through the tool-use round limit retrying instead of just answering,
// which looks like the chat has gotten stuck.
// Tool definitions are identical on every call, so marking the last one with
// a cache breakpoint lets Anthropic reuse the (large) tool-schema prefix
// across turns instead of re-processing it as fresh input every time.
function withCacheBreakpoint(tools) {
  if (tools.length === 0) return tools;
  return tools.map((tool, i, arr) =>
    i === arr.length - 1 ? { ...tool, cache_control: { type: 'ephemeral' } } : tool,
  );
}
const TOOLS = withCacheBreakpoint(
  isBigQueryConfigured()
    ? [bigQueryTool, knowledgeSearchTool, webSearchTool, subAgentTool, codeExecutionTool, memoryTool]
    : [knowledgeSearchTool, webSearchTool, subAgentTool, codeExecutionTool, memoryTool],
);

/**
 * Wraps a plain-string system prompt as a cacheable content block, always
 * prefixed with the memory-tool instruction — without it the model has no
 * reason to ever check /memories, and cross-conversation memory silently
 * never gets used.
 */
function systemParam(system) {
  const text = system ? `${MEMORY_SYSTEM_INSTRUCTION}\n\n${system}` : MEMORY_SYSTEM_INSTRUCTION;
  return [{ type: 'text', text, cache_control: { type: 'ephemeral' } }];
}

/**
 * Marks the last message of the (already-loaded) history as a cache
 * breakpoint, so the growing conversation prefix is served from Anthropic's
 * cache on every subsequent turn instead of being reprocessed in full.
 */
function withHistoryCacheBreakpoint(messages) {
  if (messages.length === 0) return messages;
  const lastIndex = messages.length - 1;
  const last = messages[lastIndex];
  const content =
    typeof last.content === 'string'
      ? [{ type: 'text', text: last.content, cache_control: { type: 'ephemeral' } }]
      : last.content.map((block, i, arr) =>
          i === arr.length - 1 ? { ...block, cache_control: { type: 'ephemeral' } } : block,
        );
  return [...messages.slice(0, lastIndex), { ...last, content }];
}

async function runTool(toolUse, userId) {
  if (toolUse.name === 'query_bigquery') return runBigQueryTool(toolUse.input);
  if (toolUse.name === 'search_knowledge_base') return runKnowledgeSearchTool(toolUse.input);
  if (toolUse.name === 'spawn_subagent') return runSubAgentTool(toolUse.input);
  if (toolUse.name === 'memory') return runMemoryTool(userId, toolUse.input);
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
async function runAllToolUses(content, redaction, userId) {
  const toolUses = content.filter((b) => b.type === 'tool_use');
  const results = await Promise.all(
    toolUses.map(async (toolUse) => {
      let toolResult;
      try {
        toolResult = await runTool(toolUse, userId);
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

export async function saveMessage(conversationId, role, content, commandUsed = null, citations = null, generatedFiles = null) {
  const { rows } = await query(
    'INSERT INTO messages (conversation_id, role, content, command_used, citations, generated_files) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [
      conversationId,
      role,
      content,
      commandUsed,
      citations ? JSON.stringify(citations) : null,
      generatedFiles ? JSON.stringify(generatedFiles) : null,
    ],
  );
  return rows[0].id;
}

/**
 * Pulls web-search citations (url/title) off a finished response's `text`
 * blocks and dedupes them by URL, so the frontend can render a source list
 * under the reply instead of the user only seeing bare prose with no
 * indication the model actually looked anything up.
 */
function extractCitations(content) {
  const seen = new Map();
  for (const block of content) {
    if (block.type !== 'text' || !Array.isArray(block.citations)) continue;
    for (const citation of block.citations) {
      if (citation.type !== 'web_search_result_location' || !citation.url) continue;
      if (!seen.has(citation.url)) seen.set(citation.url, { url: citation.url, title: citation.title || citation.url });
    }
  }
  return seen.size > 0 ? Array.from(seen.values()) : null;
}

/**
 * Pulls `file_id`s the sandbox wrote out (via `code_execution`) off a
 * finished response and fetches each one's filename/mime type/size from the
 * Files API, so the frontend can offer a real download link instead of the
 * user only seeing the code's stdout mentioning a file it can't get to.
 */
async function extractGeneratedFiles(client, content) {
  const fileIds = new Set();
  for (const block of content) {
    if (block.type !== 'code_execution_tool_result') continue;
    const outputs = block.content?.content;
    if (!Array.isArray(outputs)) continue;
    for (const output of outputs) {
      if (output.type === 'code_execution_output' && output.file_id) fileIds.add(output.file_id);
    }
  }
  if (fileIds.size === 0) return null;

  const files = await Promise.all(
    [...fileIds].map(async (fileId) => {
      try {
        const meta = await client.beta.files.retrieveMetadata(fileId, {}, { headers: { 'anthropic-beta': FILES_API_BETA } });
        return { fileId, filename: meta.filename, mimeType: meta.mime_type, sizeBytes: meta.size_bytes };
      } catch {
        return null;
      }
    }),
  );
  const resolved = files.filter(Boolean);
  return resolved.length > 0 ? resolved : null;
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

/** Extracts plain text from a .docx buffer via mammoth. */
async function extractDocxText(buffer) {
  const mammoth = (await import('mammoth')).default;
  const result = await mammoth.extractRawText({ buffer });
  return result.value.slice(0, 20_000);
}

/** Renders a .xlsx workbook as tab-separated text, one block per sheet. */
async function extractXlsxText(buffer) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheets = [];
  workbook.eachSheet((sheet) => {
    const rows = [];
    sheet.eachRow((row) => {
      rows.push(row.values.slice(1).map((v) => (v ?? '').toString()).join('\t'));
    });
    sheets.push(`## Arkusz: ${sheet.name}\n${rows.join('\n')}`);
  });
  return sheets.join('\n\n').slice(0, 20_000);
}

/**
 * Extracts slide text from a .pptx by reading each slide's XML directly out
 * of the zip (a full OOXML parser would be overkill just to pull `<a:t>`
 * runs) — `pptxgenjs`'s writer doesn't help us read files, so this goes
 * straight through `jszip`.
 */
async function extractPptxText(buffer) {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));

  const slides = [];
  for (const name of slideFiles) {
    const xml = await zip.files[name].async('text');
    const runs = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]);
    slides.push(`## Slajd ${slides.length + 1}\n${runs.join(' ')}`);
  }
  return slides.join('\n\n').slice(0, 20_000);
}

/**
 * Builds the content sent to Claude for this turn: the text prompt, plus any
 * image attachments as vision blocks, plus any small text-file attachments
 * (PDF, docx, xlsx, pptx text, extracted via the libraries above) inlined as
 * fenced text — Claude has no other way to "see" a .txt/.csv/.pdf/.docx/
 * .xlsx/.pptx upload.
 */
async function buildPromptContent(promptText, attachments) {
  const images = attachments.filter((f) => isImageAttachment(f.mimeType));
  const textFiles = attachments.filter((f) => isTextAttachment(f.mimeType));
  const pdfFiles = attachments.filter((f) => isPdfAttachment(f.mimeType));
  const docxFiles = attachments.filter((f) => isDocxAttachment(f.mimeType));
  const xlsxFiles = attachments.filter((f) => isXlsxAttachment(f.mimeType));
  const pptxFiles = attachments.filter((f) => isPptxAttachment(f.mimeType));

  let text = promptText;
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

  if (images.length === 0) return text;

  return [
    { type: 'text', text },
    ...images.map((file) => ({
      type: 'image',
      source: { type: 'base64', media_type: file.mimeType, data: file.buffer.toString('base64') },
    })),
  ];
}

// `code_execution` is still a beta tool, so every chat completion call goes
// through `client.beta.messages` (with the beta header below) instead of
// the stable `client.messages` — the beta endpoint accepts every parameter
// the stable one does, so this is a drop-in replacement for the other tools.
async function createChatMessage(client, params) {
  const mcpServers = await getEnabledMcpServers();
  return client.beta.messages.create({
    ...params,
    ...(mcpServers.length > 0 ? { mcp_servers: mcpServers } : {}),
    betas: [CODE_EXECUTION_BETA, FILES_API_BETA, MCP_CLIENT_BETA],
  });
}

async function runToolLoop(client, messages, redaction, userId, { model = CHAT_MODEL, system } = {}) {
  messages = stripOrphanedToolUses(messages);
  let response = await createChatMessage(client, {
    model,
    max_tokens: 4096,
    tools: TOOLS,
    messages,
    system: systemParam(system),
  });

  let toolRounds = 0;
  while (response.stop_reason === 'tool_use') {
    if (++toolRounds > MAX_TOOL_ROUNDS) {
      throw new Error(`Tool-use loop exceeded ${MAX_TOOL_ROUNDS} rounds`);
    }
    const toolResults = await runAllToolUses(response.content, redaction, userId);

    messages = stripOrphanedToolUses([
      ...messages,
      { role: 'assistant', content: stripThinkingBlocks(response.content) },
      { role: 'user', content: toolResults },
    ]);

    response = await createChatMessage(client, {
      model,
      max_tokens: 4096,
      tools: TOOLS,
      messages,
      system: systemParam(system),
    });
  }

  return response;
}

/**
 * Manually consumes a raw beta SSE stream (`client.beta.messages` has no
 * `.stream()` convenience wrapper like the stable client does) and
 * reassembles it into the same shape `stream.finalMessage()` would have
 * returned — `{ content, stop_reason, usage }` — while forwarding each text
 * delta to `onChunk` as it arrives.
 */
async function streamChatMessage(client, params, onChunk, signal) {
  const mcpServers = await getEnabledMcpServers();
  const stream = await client.beta.messages.create(
    {
      ...params,
      ...(mcpServers.length > 0 ? { mcp_servers: mcpServers } : {}),
      betas: [CODE_EXECUTION_BETA, FILES_API_BETA, MCP_CLIENT_BETA],
      stream: true,
    },
    { signal },
  );

  const blocks = [];
  let stopReason = null;
  let usage = { input_tokens: 0, output_tokens: 0 };

  for await (const event of stream) {
    if (event.type === 'message_start') {
      usage = { ...event.message.usage };
    } else if (event.type === 'content_block_start') {
      blocks[event.index] = { ...event.content_block };
    } else if (event.type === 'content_block_delta') {
      const block = blocks[event.index];
      if (event.delta.type === 'text_delta') {
        block.text = (block.text ?? '') + event.delta.text;
        onChunk(event.delta.text);
      } else if (event.delta.type === 'input_json_delta') {
        block._partialJson = (block._partialJson ?? '') + event.delta.partial_json;
      } else if (event.delta.type === 'citations_delta') {
        block.citations = [...(block.citations ?? []), event.delta.citation];
      }
    } else if (event.type === 'content_block_stop') {
      const block = blocks[event.index];
      if (block._partialJson !== undefined) {
        block.input = block._partialJson ? JSON.parse(block._partialJson) : {};
        delete block._partialJson;
      }
    } else if (event.type === 'message_delta') {
      stopReason = event.delta.stop_reason;
      if (event.usage) usage = { ...usage, ...event.usage };
    }
  }

  return { content: blocks, stop_reason: stopReason, usage };
}

/**
 * Same tool-use loop as `runToolLoop`, but calls Claude's streaming API and
 * forwards each text delta to `onChunk` as it arrives. If the model wants to
 * call the BigQuery tool, that round isn't streamed token-by-token (tool
 * calls don't produce user-facing text anyway); the round after the tool
 * result resumes streaming normally.
 */
async function runToolLoopStreaming(client, messages, redaction, onChunk, signal, userId, { model = CHAT_MODEL, system } = {}) {
  let fullText = '';
  let usage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
  let toolRounds = 0;
  let lastContent = [];
  messages = stripOrphanedToolUses(messages);

  for (;;) {
    if (toolRounds > MAX_TOOL_ROUNDS) {
      throw new Error(`Tool-use loop exceeded ${MAX_TOOL_ROUNDS} rounds`);
    }

    let message;
    try {
      message = await streamChatMessage(
        client,
        { model, max_tokens: 4096, tools: TOOLS, messages, system: systemParam(system) },
        (delta) => {
          fullText += delta;
          onChunk(delta);
        },
        signal,
      );
    } catch (err) {
      if (signal?.aborted) break;
      throw err;
    }

    usage = {
      input_tokens: usage.input_tokens + message.usage.input_tokens,
      output_tokens: usage.output_tokens + message.usage.output_tokens,
      cache_creation_input_tokens:
        usage.cache_creation_input_tokens + (message.usage.cache_creation_input_tokens ?? 0),
      cache_read_input_tokens: usage.cache_read_input_tokens + (message.usage.cache_read_input_tokens ?? 0),
    };

    lastContent = message.content;
    if (message.stop_reason !== 'tool_use') break;
    toolRounds += 1;

    const toolResults = await runAllToolUses(message.content, redaction, userId);

    messages = stripOrphanedToolUses([
      ...messages,
      { role: 'assistant', content: stripThinkingBlocks(message.content) },
      { role: 'user', content: toolResults },
    ]);
  }

  return {
    text: fullText,
    usage,
    citations: extractCitations(lastContent),
    generatedFiles: await extractGeneratedFiles(client, lastContent),
  };
}

async function finishAssistantReply({
  conversationId,
  safeMessage,
  commandUsed,
  replyText,
  usage,
  latencyMs,
  model = CHAT_MODEL,
  citations = null,
  generatedFiles = null,
}) {
  const assistantMessageId = await saveMessage(conversationId, 'assistant', replyText, commandUsed, citations, generatedFiles);
  await recordUsage({
    messageId: assistantMessageId,
    model,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    latencyMs,
    commandUsed,
  });
  // Fire-and-forget: never block the user-facing reply on the judge call.
  judgeResponse({ messageId: assistantMessageId, userQuestion: safeMessage, assistantAnswer: replyText });
  return assistantMessageId;
}

/**
 * Loads the per-conversation model override and system prompt, if set, plus
 * the owning user's default system prompt (role/context, set once in their
 * settings and applied to every conversation). Effective system prompt is
 * the user default followed by the conversation-specific one, so a
 * specialist's personal context always applies and per-chat text adds to it.
 */
async function getConversationSettings(conversationId) {
  const { rows } = await query(
    `SELECT c.model, c.system_prompt, u.default_system_prompt
     FROM conversations c JOIN users u ON u.id = c.user_id
     WHERE c.id = $1`,
    [conversationId],
  );
  const system = [rows[0]?.default_system_prompt, rows[0]?.system_prompt].filter(Boolean).join('\n\n') || undefined;
  return {
    model: rows[0]?.model || CHAT_MODEL,
    system,
  };
}

/**
 * Loads this conversation's persisted PII/client-name token map and
 * per-category counters, so a new redaction session continues numbering
 * (`[KLIENT_7]`, not a restarted `[KLIENT_1]`) instead of colliding with
 * tokens already saved into this conversation's message history.
 */
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
 * Estimates the input-token cost of sending `draftText` right now, using the
 * real conversation history/settings/tools so the count matches what the
 * actual call would send. `countTokens` doesn't consume any tokens itself,
 * so this is safe to call on every draft edit (the frontend debounces it).
 * Output tokens aren't known ahead of time, so the estimate covers only the
 * input side of the turn — the eventual reply adds more.
 */
export async function estimateTurnCost({ conversationId, draftText }) {
  const trimmed = (draftText ?? '').trim();
  if (!trimmed) return { inputTokens: 0, estimatedCostUsd: 0, model: CHAT_MODEL };

  const [history, settings] = await Promise.all([loadHistory(conversationId), getConversationSettings(conversationId)]);
  const client = await getAnthropicClient();
  // The count_tokens endpoint rejects server tools (code_execution,
  // web_search) outright — only our own custom tools (plain `input_schema`
  // objects, no top-level `type`) can be included here.
  const countableTools = TOOLS.filter((tool) => !tool.type);
  const { input_tokens: inputTokens } = await client.beta.messages.countTokens({
    model: settings.model,
    tools: countableTools,
    messages: [...withHistoryCacheBreakpoint(history), { role: 'user', content: trimmed }],
    system: systemParam(settings.system),
  });

  return {
    inputTokens,
    estimatedCostUsd: estimateCostUsd(settings.model, inputTokens, 0) ?? 0,
    model: settings.model,
  };
}

/**
 * Shared prep for a brand-new user turn: redaction, auto-title, hard-block
 * precheck, slash-command dispatch, conversation history load, and monthly
 * budget check. Returns either a finished result (bypass/blocked/over
 * budget — nothing left to do) or everything needed to call Claude.
 */
async function prepareNewTurn({ conversationId, userId, userMessage, attachments, overrideBlock = false }) {
  const terms = await getRedactionTerms();
  const redactionState = await loadRedactionState(conversationId);
  const session = createRedactionSession(terms, redactionState);
  const safeMessage = session.redact(userMessage);
  const piiCategories = session.categories;
  // Persist right after tokenizing the incoming message (before any early
  // return below) so every path that saves `safeMessage` to `messages` has
  // already reserved its tokens against this conversation's running counters.
  await saveRedactionState(conversationId, session);
  await maybeSetConversationTitle(conversationId, safeMessage);

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
export async function handleChatTurn({ conversationId, userId, userMessage, attachments = [], overrideBlock = false }) {
  const prep = await prepareNewTurn({ conversationId, userId, userMessage, attachments, overrideBlock });
  if (prep.done) return prep.result;

  const client = await getAnthropicClient();
  const started = Date.now();
  const response = await runToolLoop(
    client,
    [...withHistoryCacheBreakpoint(prep.history), { role: 'user', content: prep.currentContent }],
    prep.session,
    userId,
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
  // Web search responses often come back as several `text` blocks
  // interleaved with citations/search blocks, not a single block — joining
  // all of them (not just the first) avoids silently truncating the answer.
  const replyText = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  const citations = extractCitations(response.content);
  const generatedFiles = await extractGeneratedFiles(client, response.content);
  const assistantMessageId = await finishAssistantReply({
    conversationId,
    safeMessage: prep.safeMessage,
    commandUsed: prep.commandUsed,
    replyText,
    usage: response.usage,
    latencyMs,
    model: prep.settings.model,
    citations,
    generatedFiles,
  });
  // Tool results (BigQuery/RAG) can mint additional tokens mid-turn — persist
  // the session's final state so the next turn's counters continue from here.
  await saveRedactionState(conversationId, prep.session);
  return {
    reply: prep.session.restore(replyText),
    messageId: assistantMessageId,
    commandUsed: prep.commandUsed,
    citations,
    generatedFiles,
  };
}

/** Streaming entry point for a brand-new user turn (`onChunk` gets each text delta). */
export async function streamChatTurn({ conversationId, userId, userMessage, attachments = [], onChunk, signal, overrideBlock = false }) {
  const prep = await prepareNewTurn({ conversationId, userId, userMessage, attachments, overrideBlock });
  if (prep.done) return prep.result;

  const client = await getAnthropicClient();
  const started = Date.now();
  // Chunks reach the browser de-tokenized live; the accumulated `text` used
  // for DB storage/judging below stays tokenized — see restorePii's docstring.
  // The chunker reads prep.session.map live, so tokens discovered in a
  // BigQuery/RAG tool result mid-stream still get de-tokenized correctly.
  const chunker = prep.session.createChunker(onChunk);
  const { text, usage, citations, generatedFiles } = await runToolLoopStreaming(
    client,
    [...withHistoryCacheBreakpoint(prep.history), { role: 'user', content: prep.currentContent }],
    prep.session,
    (delta) => chunker.push(delta),
    signal,
    userId,
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
    citations,
    generatedFiles,
  });
  await saveRedactionState(conversationId, prep.session);
  return {
    reply: prep.session.restore(text),
    messageId: assistantMessageId,
    commandUsed: prep.commandUsed,
    citations,
    generatedFiles,
  };
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
  const redactionState = await loadRedactionState(conversationId);
  const session = createRedactionSession(terms, redactionState);

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
  const { text, usage, citations, generatedFiles } = await runToolLoopStreaming(
    client,
    [...withHistoryCacheBreakpoint(history), { role: 'user', content: currentContent }],
    session,
    onChunk,
    signal,
    userId,
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
    citations,
    generatedFiles,
  });
  await saveRedactionState(conversationId, session);
  return { reply: text, messageId: assistantMessageId, commandUsed, citations, generatedFiles };
}
