import { getAnthropicClient } from '../anthropicClient.js';
import { bigQueryTool, runBigQueryTool } from '../mcp/bigqueryServer.js';
import { knowledgeSearchTool, runKnowledgeSearchTool } from '../mcp/knowledgeServer.js';
import { recordUsage } from '../metrics/usageTracker.js';
import { judgeResponse } from '../judge/qualityJudge.js';
import { parseCommand, dispatchCommand } from './slashDispatch.js';
import { redactPii } from '../security/piiRedaction.js';
import { precheckMessage } from '../security/sensitiveDataPrecheck.js';
import { detectUncertainLeak } from '../security/uncertainLeakAgent.js';
import { checkMonthlyBudget } from '../../config/budget.js';
import { query } from '../../config/db.js';
import {
  saveAttachmentFile,
  readAttachmentFile,
  deleteAttachmentFile,
  isImageAttachment,
  isTextAttachment,
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
const TITLE_MAX_LENGTH = 60;
const BLOCKED_REPLY = 'Ta wiadomość została zablokowana przez automatyczną kontrolę bezpieczeństwa danych (wykryto potencjalnie wrażliwe dane) i nie została wysłana do modelu AI. Jeśli to pomyłka, skontaktuj się z administratorem.';

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

/**
 * Builds the content sent to Claude for this turn: the text prompt, plus any
 * image attachments as vision blocks, plus any small text-file attachments
 * inlined as fenced text (Claude has no other way to "see" a .txt/.csv upload).
 */
function buildPromptContent(promptText, attachments) {
  const images = attachments.filter((f) => isImageAttachment(f.mimeType));
  const textFiles = attachments.filter((f) => isTextAttachment(f.mimeType));

  let text = promptText;
  for (const file of textFiles) {
    text += `\n\n--- Załącznik: ${file.filename} ---\n${file.buffer.toString('utf-8').slice(0, 20_000)}`;
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

async function runToolLoop(client, messages, { model = CHAT_MODEL, system } = {}) {
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
    const toolUse = response.content.find((b) => b.type === 'tool_use');
    let toolResult;
    try {
      toolResult = await runTool(toolUse);
    } catch (err) {
      toolResult = { error: err.message };
    }

    messages = [
      ...messages,
      { role: 'assistant', content: response.content },
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify(toolResult) }],
      },
    ];

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
async function runToolLoopStreaming(client, messages, onChunk, signal, { model = CHAT_MODEL, system } = {}) {
  let fullText = '';
  let usage = { input_tokens: 0, output_tokens: 0 };
  let toolRounds = 0;

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

    const toolUse = message.content.find((b) => b.type === 'tool_use');
    let toolResult;
    try {
      toolResult = await runTool(toolUse);
    } catch (err) {
      toolResult = { error: err.message };
    }

    messages = [
      ...messages,
      { role: 'assistant', content: message.content },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify(toolResult) }] },
    ];
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
 * Shared prep for a brand-new user turn: redaction, auto-title, hard-block
 * precheck, slash-command dispatch, conversation history load, and monthly
 * budget check. Returns either a finished result (bypass/blocked/over
 * budget — nothing left to do) or everything needed to call Claude.
 */
async function prepareNewTurn({ conversationId, userId, userMessage, attachments }) {
  const safeMessage = redactPii(userMessage);
  await maybeSetConversationTitle(conversationId, safeMessage);

  const precheck = await precheckMessage({ conversationId, userMessage: safeMessage });
  if (precheck.blocked) {
    const userMessageId = await saveMessage(conversationId, 'user', safeMessage);
    await saveAttachments(userMessageId, attachments);
    const assistantMessageId = await saveMessage(conversationId, 'assistant', BLOCKED_REPLY);
    return { done: true, result: { reply: BLOCKED_REPLY, messageId: assistantMessageId, commandUsed: null, blocked: true } };
  }

  // Fire-and-forget: flags ambiguous-but-worrying messages that didn't meet
  // the hard-block confidence threshold, without adding latency to the chat.
  detectUncertainLeak({ conversationId, userId, userMessage: safeMessage });

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

  return {
    done: false,
    history,
    currentContent: buildPromptContent(promptForLlm, attachments),
    commandUsed,
    safeMessage,
    settings: await getConversationSettings(conversationId),
  };
}

/** Non-streaming entry point for a brand-new user turn. */
export async function handleChatTurn({ conversationId, userId, userMessage, attachments = [] }) {
  const prep = await prepareNewTurn({ conversationId, userId, userMessage, attachments });
  if (prep.done) return prep.result;

  const client = await getAnthropicClient();
  const started = Date.now();
  const response = await runToolLoop(client, [...prep.history, { role: 'user', content: prep.currentContent }], prep.settings);
  const latencyMs = Date.now() - started;
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
  return { reply: replyText, messageId: assistantMessageId, commandUsed: prep.commandUsed };
}

/** Streaming entry point for a brand-new user turn (`onChunk` gets each text delta). */
export async function streamChatTurn({ conversationId, userId, userMessage, attachments = [], onChunk, signal }) {
  const prep = await prepareNewTurn({ conversationId, userId, userMessage, attachments });
  if (prep.done) return prep.result;

  const client = await getAnthropicClient();
  const started = Date.now();
  const { text, usage } = await runToolLoopStreaming(
    client,
    [...prep.history, { role: 'user', content: prep.currentContent }],
    onChunk,
    signal,
    prep.settings,
  );
  const latencyMs = Date.now() - started;
  const assistantMessageId = await finishAssistantReply({
    conversationId,
    safeMessage: prep.safeMessage,
    commandUsed: prep.commandUsed,
    replyText: text,
    usage,
    latencyMs,
    model: prep.settings.model,
  });
  return { reply: text, messageId: assistantMessageId, commandUsed: prep.commandUsed };
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

  const precheck = await precheckMessage({ conversationId, userMessage: safeMessage });
  if (precheck.blocked) {
    const assistantMessageId = await saveMessage(conversationId, 'assistant', BLOCKED_REPLY);
    return { reply: BLOCKED_REPLY, messageId: assistantMessageId, commandUsed: null, blocked: true };
  }

  detectUncertainLeak({ conversationId, userId, userMessage: safeMessage });

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
  const currentContent = buildPromptContent(promptForLlm, attachments);
  const settings = await getConversationSettings(conversationId);

  const client = await getAnthropicClient();
  const started = Date.now();
  const { text, usage } = await runToolLoopStreaming(
    client,
    [...history, { role: 'user', content: currentContent }],
    onChunk,
    signal,
    settings,
  );
  const latencyMs = Date.now() - started;
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
