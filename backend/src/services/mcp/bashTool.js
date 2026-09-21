import { Sandbox } from 'e2b';
import { logger } from '../../config/logger.js';
import { getSecret } from '../../config/secrets.js';

// MVP scope: one ephemeral e2b sandbox per chat turn, not per conversation.
// It's created lazily on the first `bash` call within a turn's tool-use
// loop and killed once that turn finishes (see closeBashSession in
// pipeline.js) — no filesystem state, no git checkout, nothing survives
// between turns. This buys a real shell (unlike Anthropic's own
// `code_execution`, which is Python-only and has no persistent workspace
// within even one call) without needing Docker-in-Docker, which Railway's
// runtime doesn't support.
const SANDBOX_TIMEOUT_MS = 60_000;
const COMMAND_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_CHARS = 8_000;

export const bashTool = {
  name: 'bash',
  description:
    'Runs a shell command in a fresh, isolated Linux sandbox and returns its stdout/stderr. ' +
    'The sandbox has its own filesystem that persists only for the rest of THIS turn (you can ' +
    'write a file with one call and read/run it with the next), but nothing survives once you ' +
    'finish replying — there is no access to any real repository, server, or user data. Use it ' +
    'for tasks Python-only code execution can\'t do: multi-file scripts, installing a package, ' +
    'running a build/test command, inspecting a project layout, etc.',
  input_schema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The shell command to run, e.g. "ls -la" or "python3 script.py".' },
    },
    required: ['command'],
  },
};

function truncate(text) {
  if (!text || text.length <= MAX_OUTPUT_CHARS) return text;
  return `${text.slice(0, MAX_OUTPUT_CHARS)}\n… (truncated, ${text.length - MAX_OUTPUT_CHARS} more chars)`;
}

/**
 * Runs `bash` tool calls against one lazily-created sandbox per `session`
 * object — the caller owns that object's lifetime (one per chat turn) and
 * must call `closeBashSession` on it when the turn ends.
 */
export async function runBashTool(session, { command }) {
  if (!command || typeof command !== 'string') {
    return { error: 'Missing required "command" string.' };
  }

  const apiKey = await getSecret('E2B_API_KEY');
  if (!apiKey) {
    return { error: 'Bash sandbox is not configured (missing E2B_API_KEY).' };
  }

  if (!session.sandbox) {
    session.sandbox = await Sandbox.create({ apiKey, timeoutMs: SANDBOX_TIMEOUT_MS });
  }

  try {
    const result = await session.sandbox.commands.run(command, { timeoutMs: COMMAND_TIMEOUT_MS });
    return {
      exitCode: result.exitCode,
      stdout: truncate(result.stdout),
      stderr: truncate(result.stderr),
    };
  } catch (err) {
    return { error: err.message };
  }
}

/** Kills the turn's sandbox, if one was created — always call this when a turn's tool loop ends. */
export async function closeBashSession(session) {
  if (!session.sandbox) return;
  try {
    await session.sandbox.kill();
  } catch (err) {
    logger.warn('Failed to kill bash sandbox', { error: err.message });
  } finally {
    session.sandbox = null;
  }
}
