import { test } from 'node:test';
import assert from 'node:assert/strict';
import { streamChatCompletion } from './ollamaClient.js';

// Node's native fetch yields the response body as an async-iterable of
// Uint8Array chunks (never Node `Buffer` instances) -- this fakes that
// exact shape, including a multi-byte UTF-8 character ('ą', 2 bytes) and a
// line's own newline split across two separate chunks, which is what
// previously broke streamChatCompletion entirely (see ollamaClient.js).
function fakeStreamingResponse(lines) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  const splitAt = Math.floor(bytes.length / 2);

  return {
    ok: true,
    body: {
      [Symbol.asyncIterator]: async function* () {
        yield bytes.slice(0, splitAt);
        yield bytes.slice(splitAt);
      },
    },
  };
}

test('streamChatCompletion decodes Uint8Array chunks (not Node Buffers) into real text', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async () =>
    fakeStreamingResponse([
      { message: { role: 'assistant', content: 'cześć, ' } },
      { message: { role: 'assistant', content: 'świetna próba' } },
      { message: { role: 'assistant', content: '' }, done: true, prompt_eval_count: 5, eval_count: 7 },
    ]);

  const deltas = [];
  const result = await streamChatCompletion({
    messages: [{ role: 'user', content: 'test' }],
    onDelta: (delta) => deltas.push(delta),
  });

  assert.equal(deltas.join(''), 'cześć, świetna próba');
  assert.equal(result.content, 'cześć, świetna próba');
  assert.deepEqual(result.toolCalls, []);
  assert.deepEqual(result.usage, { input_tokens: 5, output_tokens: 7 });
});

test('streamChatCompletion collects tool_calls from a streamed chunk', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async () =>
    fakeStreamingResponse([
      {
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{ function: { name: 'search_knowledge_base', arguments: { query: 'test' } } }],
        },
      },
      { message: { role: 'assistant', content: '' }, done: true, prompt_eval_count: 1, eval_count: 1 },
    ]);

  const result = await streamChatCompletion({ messages: [{ role: 'user', content: 'test' }], onDelta: () => {} });

  assert.equal(result.content, '');
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0].name, 'search_knowledge_base');
  assert.deepEqual(result.toolCalls[0].input, { query: 'test' });
});
