// Local Ollama client — replaces the previous Anthropic Claude integration.
// Ollama's HTTP API (http://localhost:11434 by default) is OpenAI-ish but
// its own shape: POST /api/chat with { model, messages, stream, tools },
// a single JSON object back when stream:false, or newline-delimited JSON
// chunks when stream:true. No API key, no per-token cost — it's a model
// running on this machine (or wherever OLLAMA_BASE_URL points).

export const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1';

// llama.cpp (which Ollama embeds) sizes its thread pool off the host's
// reported logical CPU count, not the container's actual cgroup CPU quota.
// On a host with many cores but a small per-container quota (e.g. Railway),
// that drastically over-subscribes the quota and the CFS bandwidth
// controller throttles the process into near-total stall instead of just
// running slower. Capping num_thread to the real quota avoids that.
const NUM_THREAD = process.env.OLLAMA_NUM_THREAD ? Number(process.env.OLLAMA_NUM_THREAD) : undefined;

// Small base models (no instruction-tuned stop behavior to rely on) can fail
// to emit an end-of-sequence token and ramble on for thousands of tokens
// instead of stopping -- with no cap a single reply can run for minutes.
// num_predict is Ollama's hard ceiling on generated tokens per request.
const NUM_PREDICT = process.env.OLLAMA_NUM_PREDICT ? Number(process.env.OLLAMA_NUM_PREDICT) : 400;

function withThreadOptions(options) {
  return {
    ...options,
    ...(NUM_THREAD ? { num_thread: NUM_THREAD } : {}),
    ...(NUM_PREDICT ? { num_predict: NUM_PREDICT } : {}),
  };
}

function toOllamaMessages(messages, system) {
  const sys = system ? [{ role: 'system', content: system }] : [];
  return [...sys, ...messages.map((m) => ({ role: m.role, content: String(m.content ?? '') }))];
}

function toOllamaTools(tools) {
  if (!tools || tools.length === 0) return undefined;
  return tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));
}

/**
 * One-shot, non-streaming completion for the small classifier-style calls
 * (precheck, compliance/leak agents) that used to go through a cheap Claude
 * model: a system prompt + one user text in, plain text out. Mirrors the
 * old `client.messages.create(...).content.find(b=>b.type==='text').text`
 * shape those call sites used, so each only needs its import/call swapped.
 */
export async function completeText({ model = OLLAMA_MODEL, system, prompt }) {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      messages: toOllamaMessages([{ role: 'user', content: prompt }], system),
      options: withThreadOptions({}),
    }),
  });
  if (!res.ok) throw new Error(`Ollama request failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return { text: data.message?.content ?? '' };
}

/**
 * Non-streaming chat completion for the main conversation loop, with
 * optional function-calling tools. Returns a shape the pipeline's tool loop
 * can drive directly: `content` (assistant text so far this round),
 * `toolCalls` (array of {id, name, input} — Ollama doesn't assign call ids,
 * so one is synthesized), `usage` (token counts Ollama reports natively).
 */
export async function chatCompletion({ model = OLLAMA_MODEL, messages, system, tools }) {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      messages: toOllamaMessages(messages, system),
      options: withThreadOptions({}),
      ...(tools ? { tools: toOllamaTools(tools) } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Ollama request failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const toolCalls = (data.message?.tool_calls ?? []).map((tc, i) => ({
    id: `${Date.now()}_${i}`,
    name: tc.function?.name,
    input: tc.function?.arguments ?? {},
  }));
  return {
    content: data.message?.content ?? '',
    toolCalls,
    usage: { input_tokens: data.prompt_eval_count ?? 0, output_tokens: data.eval_count ?? 0 },
  };
}

/**
 * Streaming variant: forwards each incremental text fragment to `onDelta`
 * as it arrives (Ollama's NDJSON stream sends content incrementally, not
 * cumulatively, same contract the old Anthropic SSE delta forwarding had).
 * Tool calls, if the model makes any, arrive attached to one of the
 * stream's chunks (usually the final one) rather than progressively — they
 * are collected the same way as the non-streaming path.
 */
export async function streamChatCompletion({ model = OLLAMA_MODEL, messages, system, tools, onDelta, signal }) {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: true,
      messages: toOllamaMessages(messages, system),
      options: withThreadOptions({}),
      ...(tools ? { tools: toOllamaTools(tools) } : {}),
    }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`Ollama request failed: ${res.status} ${res.statusText}`);

  let content = '';
  const toolCalls = [];
  let usage = { input_tokens: 0, output_tokens: 0 };
  let buffer = '';

  for await (const chunk of res.body) {
    buffer += Buffer.isBuffer(chunk) ? chunk.toString('utf-8') : chunk;
    let newlineIndex;
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (!line) continue;
      const data = JSON.parse(line);
      const delta = data.message?.content ?? '';
      if (delta) {
        content += delta;
        onDelta(delta);
      }
      for (const tc of data.message?.tool_calls ?? []) {
        toolCalls.push({ id: `${Date.now()}_${toolCalls.length}`, name: tc.function?.name, input: tc.function?.arguments ?? {} });
      }
      if (data.done) {
        usage = { input_tokens: data.prompt_eval_count ?? 0, output_tokens: data.eval_count ?? 0 };
      }
    }
  }

  return { content, toolCalls, usage };
}

/** Lists models currently pulled on the Ollama server — used by the "available models" endpoint. */
export async function listModels() {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.models ?? []).map((m) => m.name);
}
