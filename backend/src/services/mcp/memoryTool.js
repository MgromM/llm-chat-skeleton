import { query } from '../../config/db.js';

// Anthropic's native `memory` tool: a text-editor-like virtual filesystem
// the model reads/writes itself (view/create/str_replace/insert/delete/
// rename) — we only provide the storage backend. Client-executed (like
// query_bigquery), so its results flow through the normal PII-redaction
// pass in `runAllToolUses`.
export const memoryTool = { type: 'memory_20250818', name: 'memory' };

// Anthropic's own memory-tool cookbook has Claude default to checking this
// directory at the start of every conversation — prepended to the system
// prompt whenever the tool is offered (see systemParam in pipeline.js).
export const MEMORY_SYSTEM_INSTRUCTION =
  'Masz dostęp do narzędzia `memory`, które daje trwałą pamięć między rozmowami tego samego specjalisty (nie jest widoczna dla innych). ' +
  'Na początku KAŻDEJ rozmowy sprawdź katalog /memories (`view`), żeby przypomnieć sobie wcześniej zapisane fakty/preferencje o tym specjaliście, zanim odpowiesz. ' +
  'Zapisuj tam tylko trwałe, przydatne w przyszłości informacje (preferencje, stałe ustalenia) — nie każdą wiadomość.';

function normalizePath(path) {
  const trimmed = ('/' + String(path ?? '').trim()).replace(/\/+/g, '/');
  if (!trimmed.startsWith('/memories')) {
    throw new Error('Path must be inside /memories');
  }
  return trimmed.replace(/\/$/, '') || '/memories';
}

async function getFile(userId, path) {
  const { rows } = await query('SELECT content FROM user_memory_files WHERE user_id = $1 AND path = $2', [userId, path]);
  return rows[0]?.content ?? null;
}

async function listChildren(userId, dirPath) {
  const prefix = dirPath === '/memories' ? '/memories/' : `${dirPath}/`;
  const { rows } = await query(
    'SELECT path FROM user_memory_files WHERE user_id = $1 AND path LIKE $2 ORDER BY path ASC',
    [userId, `${prefix}%`],
  );
  const seen = new Set();
  const entries = [];
  for (const { path } of rows) {
    const rest = path.slice(prefix.length);
    const slash = rest.indexOf('/');
    const name = slash === -1 ? rest : `${rest.slice(0, slash)}/`;
    if (!seen.has(name)) {
      seen.add(name);
      entries.push(name);
    }
  }
  return entries;
}

async function viewCommand(userId, { path, view_range: viewRange }) {
  const normalized = normalizePath(path);
  const content = await getFile(userId, normalized);
  if (content === null) {
    const children = await listChildren(userId, normalized);
    if (children.length === 0) {
      return normalized === '/memories'
        ? 'Directory: /memories (empty — no memories saved yet)'
        : `Error: path not found: ${normalized}`;
    }
    return `Directory: ${normalized}\n${children.map((c) => `- ${c}`).join('\n')}`;
  }
  const lines = content.split('\n');
  const [start, end] = Array.isArray(viewRange) ? viewRange : [1, lines.length];
  return lines
    .slice(Math.max(0, start - 1), end)
    .map((line, i) => `${start + i}: ${line}`)
    .join('\n');
}

async function createCommand(userId, { path, file_text: fileText }) {
  const normalized = normalizePath(path);
  await query(
    `INSERT INTO user_memory_files (user_id, path, content)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, path) DO UPDATE SET content = $3, updated_at = now()`,
    [userId, normalized, fileText ?? ''],
  );
  return `Created ${normalized}`;
}

async function strReplaceCommand(userId, { path, old_str: oldStr, new_str: newStr }) {
  const normalized = normalizePath(path);
  const content = await getFile(userId, normalized);
  if (content === null) return `Error: file not found: ${normalized}`;
  const occurrences = content.split(oldStr).length - 1;
  if (occurrences === 0) return `Error: old_str not found in ${normalized}`;
  if (occurrences > 1) return `Error: old_str matches ${occurrences} times in ${normalized} — must be unique`;
  const updated = content.replace(oldStr, newStr);
  await query('UPDATE user_memory_files SET content = $2, updated_at = now() WHERE user_id = $1 AND path = $3', [
    userId,
    updated,
    normalized,
  ]);
  return `Replaced text in ${normalized}`;
}

async function insertCommand(userId, { path, insert_line: insertLine, insert_text: insertText }) {
  const normalized = normalizePath(path);
  const content = await getFile(userId, normalized);
  if (content === null) return `Error: file not found: ${normalized}`;
  const lines = content.split('\n');
  const at = Math.max(0, Math.min(insertLine ?? lines.length, lines.length));
  lines.splice(at, 0, insertText ?? '');
  await query('UPDATE user_memory_files SET content = $2, updated_at = now() WHERE user_id = $1 AND path = $3', [
    userId,
    lines.join('\n'),
    normalized,
  ]);
  return `Inserted text into ${normalized} after line ${at}`;
}

async function deleteCommand(userId, { path }) {
  const normalized = normalizePath(path);
  const { rowCount: fileDeleted } = await query('DELETE FROM user_memory_files WHERE user_id = $1 AND path = $2', [
    userId,
    normalized,
  ]);
  if (fileDeleted > 0) return `Deleted ${normalized}`;
  const { rowCount: dirDeleted } = await query('DELETE FROM user_memory_files WHERE user_id = $1 AND path LIKE $2', [
    userId,
    `${normalized}/%`,
  ]);
  if (dirDeleted > 0) return `Deleted ${dirDeleted} file(s) under ${normalized}`;
  return `Error: path not found: ${normalized}`;
}

async function renameCommand(userId, { old_path: oldPath, new_path: newPath }) {
  const from = normalizePath(oldPath);
  const to = normalizePath(newPath);
  const { rowCount: fileRenamed } = await query(
    'UPDATE user_memory_files SET path = $3, updated_at = now() WHERE user_id = $1 AND path = $2',
    [userId, from, to],
  );
  if (fileRenamed > 0) return `Renamed ${from} to ${to}`;
  const { rows } = await query('SELECT id, path FROM user_memory_files WHERE user_id = $1 AND path LIKE $2', [
    userId,
    `${from}/%`,
  ]);
  if (rows.length === 0) return `Error: path not found: ${from}`;
  await Promise.all(
    rows.map((r) => query('UPDATE user_memory_files SET path = $2, updated_at = now() WHERE id = $1', [r.id, to + r.path.slice(from.length)])),
  );
  return `Renamed ${rows.length} file(s) from ${from} to ${to}`;
}

/** For the user-facing "what does it remember about me" settings view. */
export async function listUserMemoryFiles(userId) {
  const { rows } = await query(
    'SELECT id, path, length(content) AS size_bytes, updated_at FROM user_memory_files WHERE user_id = $1 ORDER BY path ASC',
    [userId],
  );
  return rows;
}

/** Lets a user delete one of their own remembered files from the settings page. */
export async function deleteUserMemoryFile(userId, id) {
  const { rowCount } = await query('DELETE FROM user_memory_files WHERE user_id = $1 AND id = $2', [userId, id]);
  return rowCount > 0;
}

/** Lets a user wipe everything the model remembers about them in one go. */
export async function clearUserMemory(userId) {
  await query('DELETE FROM user_memory_files WHERE user_id = $1', [userId]);
}

export async function runMemoryTool(userId, input) {
  try {
    switch (input.command) {
      case 'view':
        return await viewCommand(userId, input);
      case 'create':
        return await createCommand(userId, input);
      case 'str_replace':
        return await strReplaceCommand(userId, input);
      case 'insert':
        return await insertCommand(userId, input);
      case 'delete':
        return await deleteCommand(userId, input);
      case 'rename':
        return await renameCommand(userId, input);
      default:
        return `Error: unknown command: ${input.command}`;
    }
  } catch (err) {
    return `Error: ${err.message}`;
  }
}
