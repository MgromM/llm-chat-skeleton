import { getAnthropicClient } from '../anthropicClient.js';
import { knowledgeSearchTool, runKnowledgeSearchTool } from './knowledgeServer.js';
import { webSearchTool } from './webSearchTool.js';

const SUBAGENT_MODEL = process.env.SUBAGENT_MODEL ?? 'claude-sonnet-5';
// Deliberately small and fixed: a sub-agent is meant for one bounded
// sub-task, not another open-ended conversation. Its tool set also excludes
// `spawn_subagent` itself, so a sub-agent can never spawn further
// sub-agents — that would let one user turn fan out into an unbounded tree
// of model calls.
const SUBAGENT_TOOLS = [knowledgeSearchTool, webSearchTool];
const SUBAGENT_MAX_ROUNDS = 4;
const SUBAGENT_MAX_TOKENS = 2048;

async function runSubAgentTool_Impl({ task, system_prompt: systemPrompt }) {
  const client = await getAnthropicClient();
  let messages = [{ role: 'user', content: task }];
  let response = await client.messages.create({
    model: SUBAGENT_MODEL,
    max_tokens: SUBAGENT_MAX_TOKENS,
    tools: SUBAGENT_TOOLS,
    messages,
    ...(systemPrompt ? { system: systemPrompt } : {}),
  });

  let rounds = 0;
  while (response.stop_reason === 'tool_use') {
    if (++rounds > SUBAGENT_MAX_ROUNDS) {
      throw new Error(`Sub-agent tool-use loop exceeded ${SUBAGENT_MAX_ROUNDS} rounds`);
    }
    const toolUses = response.content.filter((b) => b.type === 'tool_use');
    const toolResults = await Promise.all(
      toolUses.map(async (toolUse) => {
        let result;
        try {
          if (toolUse.name === 'search_knowledge_base') result = await runKnowledgeSearchTool(toolUse.input);
          else throw new Error(`Unknown sub-agent tool: ${toolUse.name}`);
        } catch (err) {
          result = { error: err.message };
        }
        return { type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify(result) };
      }),
    );

    messages = [
      ...messages,
      { role: 'assistant', content: response.content.filter((b) => b.type !== 'thinking') },
      { role: 'user', content: toolResults },
    ];

    response = await client.messages.create({
      model: SUBAGENT_MODEL,
      max_tokens: SUBAGENT_MAX_TOKENS,
      tools: SUBAGENT_TOOLS,
      messages,
      ...(systemPrompt ? { system: systemPrompt } : {}),
    });
  }

  return response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

// Exposed to the main agent as a tool. Lets it delegate a self-contained
// sub-task (research, a focused lookup, drafting a section) to a fresh
// model call with its own system prompt and short-lived context, instead of
// cluttering the main conversation's history with the intermediate steps.
export const subAgentTool = {
  name: 'spawn_subagent',
  description:
    'Deleguje samodzielne, dobrze zdefiniowane pod-zadanie (np. research, wyszukanie informacji, przygotowanie fragmentu treści) do pomocniczego agenta z własnym, krótkim kontekstem. Zwraca gotowy wynik tekstowy. Nie używaj do zadań wymagających pamięci całej rozmowy — pod-agent nie widzi historii czatu.',
  input_schema: {
    type: 'object',
    properties: {
      task: { type: 'string', description: 'Pełny, samodzielny opis zadania dla pod-agenta (musi zawierać cały potrzebny kontekst).' },
      system_prompt: { type: 'string', description: 'Opcjonalna rola/instrukcja systemowa dla pod-agenta, np. "Jesteś analitykiem SEO".' },
    },
    required: ['task'],
  },
};

export async function runSubAgentTool(input) {
  return runSubAgentTool_Impl(input);
}
