import { getAnthropicClient } from '../anthropicClient.js';
import { bigQueryTool, runBigQueryTool } from '../mcp/bigqueryServer.js';
import { recordUsage } from '../metrics/usageTracker.js';
import { judgeResponse } from '../judge/qualityJudge.js';
import { parseCommand, dispatchCommand } from './slashDispatch.js';
import { redactPii } from '../security/piiRedaction.js';
import { precheckMessage } from '../security/sensitiveDataPrecheck.js';
import { detectUncertainLeak } from '../security/uncertainLeakAgent.js';
import { checkMonthlyBudget } from '../../config/budget.js';
import { query } from '../../config/db.js';

const CHAT_MODEL = process.env.CHAT_MODEL ?? 'claude-sonnet-5';
const TOOLS = [bigQueryTool];

async function saveMessage(conversationId, role, content) {
  const { rows } = await query(
    'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3) RETURNING id',
    [conversationId, role, content],
  );
  return rows[0].id;
}

async function runToolLoop(client, messages) {
  let response = await client.messages.create({
    model: CHAT_MODEL,
    max_tokens: 1024,
    tools: TOOLS,
    messages,
  });

  while (response.stop_reason === 'tool_use') {
    const toolUse = response.content.find((b) => b.type === 'tool_use');
    let toolResult;
    try {
      toolResult = await runBigQueryTool(toolUse.input);
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
      model: CHAT_MODEL,
      max_tokens: 1024,
      tools: TOOLS,
      messages,
    });
  }

  return response;
}

/**
 * Main entry point for a chat turn: checks for a slash command first, then
 * (for "continue"/plain messages) calls Claude, tracks cost/latency, and
 * kicks off async quality judging. Returns the assistant's reply text.
 */
export async function handleChatTurn({ conversationId, userId, userMessage }) {
  // Redact PII once, at the entry point — the redacted text is what gets
  // stored in our DB and what the LLM (and any judge call) ever sees.
  const safeMessage = redactPii(userMessage);

  // Hard-block pre-check runs before anything else — including slash
  // commands — so a high-confidence sensitive-data detection never reaches
  // the Anthropic API regardless of how the message is phrased.
  const precheck = await precheckMessage({ conversationId, userMessage: safeMessage });
  if (precheck.blocked) {
    const reply = 'Ta wiadomość została zablokowana przez automatyczną kontrolę bezpieczeństwa danych (wykryto potencjalnie wrażliwe dane) i nie została wysłana do modelu AI. Jeśli to pomyłka, skontaktuj się z administratorem.';
    await saveMessage(conversationId, 'user', safeMessage);
    const assistantMessageId = await saveMessage(conversationId, 'assistant', reply);
    return { reply, messageId: assistantMessageId, commandUsed: null, blocked: true };
  }

  // Fire-and-forget: flags ambiguous-but-worrying messages that didn't meet
  // the hard-block confidence threshold, without adding latency to the chat.
  detectUncertainLeak({ conversationId, userId, userMessage: safeMessage });

  const parsed = parseCommand(safeMessage);
  let commandUsed = null;
  let promptForLlm = safeMessage;

  if (parsed) {
    commandUsed = parsed.name;
    const result = await dispatchCommand({
      command: parsed.command,
      args: parsed.args,
      context: { conversationId },
    });
    if (result.mode === 'bypass') {
      await saveMessage(conversationId, 'user', safeMessage);
      const assistantMessageId = await saveMessage(conversationId, 'assistant', result.reply);
      return { reply: result.reply, messageId: assistantMessageId, commandUsed };
    }
    promptForLlm = result.prompt;
  }

  await saveMessage(conversationId, 'user', safeMessage);

  const budget = await checkMonthlyBudget();
  if (!budget.withinBudget) {
    const reply = `Osiągnięto miesięczny budżet pilotażu ($${budget.spent.toFixed(2)} / $${budget.limit.toFixed(2)}). Wiadomość nie została wysłana do modelu — skontaktuj się z administratorem.`;
    const assistantMessageId = await saveMessage(conversationId, 'assistant', reply);
    return { reply, messageId: assistantMessageId, commandUsed };
  }

  const client = await getAnthropicClient();
  const started = Date.now();
  const response = await runToolLoop(client, [{ role: 'user', content: promptForLlm }]);
  const latencyMs = Date.now() - started;

  const replyText = response.content.find((b) => b.type === 'text')?.text ?? '';
  const assistantMessageId = await saveMessage(conversationId, 'assistant', replyText);

  await recordUsage({
    messageId: assistantMessageId,
    model: CHAT_MODEL,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    latencyMs,
    commandUsed,
  });

  // Fire-and-forget: never block the user-facing reply on the judge call.
  judgeResponse({ messageId: assistantMessageId, userQuestion: safeMessage, assistantAnswer: replyText });

  return { reply: replyText, messageId: assistantMessageId, commandUsed };
}
