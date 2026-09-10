import { pomocCommand } from './commands/pomoc.js';
import { kosztDzisiajCommand } from './commands/kosztDzisiaj.js';
import { analizaBigqueryCommand } from './commands/analizaBigquery.js';

// Central slash-command registry, mirroring the bypass/continue split used in
// the sister pongo-monorepo project's slash_dispatch.py:
// - "bypass": returns a canned answer directly, no LLM call, cost = 0.
// - "continue": rewrites/enriches the prompt and hands it off to the LLM pipeline.
const COMMANDS = {
  '/pomoc': pomocCommand,
  '/koszt-dzisiaj': kosztDzisiajCommand,
  '/analiza-bigquery': analizaBigqueryCommand,
};

export function parseCommand(rawMessage) {
  const trimmed = rawMessage.trim();
  const [name, ...rest] = trimmed.split(/\s+/);
  const command = COMMANDS[name.toLowerCase()];
  if (!command) return null;
  return { command, name: name.toLowerCase(), args: rest.join(' ') };
}

/**
 * Dispatches a parsed command. Returns either
 *   { mode: 'bypass', reply: string }
 * or
 *   { mode: 'continue', prompt: string }
 * for the caller to hand off to the normal Claude pipeline.
 */
export async function dispatchCommand({ command, args, context }) {
  return command.run({ args, context });
}

export function listCommands() {
  return Object.keys(COMMANDS);
}
