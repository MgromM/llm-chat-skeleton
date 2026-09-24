// Standalone document gate: run a file through the same PII redaction +
// zielona/żółta/czerwona classification policy as the chat, without needing
// the web app, a conversation, or a client record. Meant to be called from
// anywhere — a shell script, a CI step, a hook in a coding agent — that
// wants to check "is this document safe to hand to an LLM" before doing so.
//
// Usage: node scripts/check-document.mjs <path-to-file>
//
// Exit codes double as the gate's interface for callers that don't want to
// parse output: 0 = zielona, 1 = żółta/do przeglądu, 2 = czerwona,
// 3 = błąd klasyfikacji lub nieobsługiwany typ pliku (never treat this as
// "safe" — it means the gate couldn't actually check).
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node scripts/check-document.mjs <path-to-file>');
  process.exit(3);
}

const EXTENSION_MIME_TYPES = {
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.md': 'text/markdown',
  '.json': 'application/json',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

const ext = path.extname(filePath).toLowerCase();
const mimeType = EXTENSION_MIME_TYPES[ext];
if (!mimeType) {
  console.error(`Nieobsługiwane rozszerzenie: ${ext || '(brak)'}. Obsługiwane: ${Object.keys(EXTENSION_MIME_TYPES).join(', ')}`);
  process.exit(3);
}

let buffer;
try {
  buffer = await fs.readFile(filePath);
} catch (err) {
  console.error(`Nie udało się odczytać pliku: ${err.message}`);
  process.exit(3);
}

const { checkDocument } = await import('../src/services/gateway/documentGateway.js');
const { pool } = await import('../src/config/db.js');

const filename = path.basename(filePath);
const result = await checkDocument({ buffer, filename, mimeType });

console.log(`\nPlik:       ${result.filename}`);
console.log(`Werdykt:    ${result.level}`);
if (result.category) console.log(`Kategoria:  ${result.category}`);
if (typeof result.confidence === 'number') console.log(`Pewność:    ${result.confidence}`);
if (result.rationale) console.log(`Uzasadnienie: ${result.rationale}`);
if (result.piiCategories?.length) console.log(`PII znalezione: ${result.piiCategories.join(', ')}`);
if (result.truncated) console.log('Uwaga: dokument przekroczył limit znaków i został ucięty przed klasyfikacją — to NIE jest ocena całego pliku.');
if (result.error) console.log(`Błąd:       ${result.error}`);
console.log('');

await pool.end();

const EXIT_CODES = { zielona: 0, żółta: 1, czerwona: 2 };
process.exit(EXIT_CODES[result.level] ?? 3);
