// CLI entry point for the canteen catalog ingestion pipeline -- the same
// ingestCanteenDocument used by POST /canteen/facilities/:id/documents, just
// invoked from a shell instead of an authenticated upload. Structured,
// already-digital files only (xlsx/csv/pdf/docx) -- a photo/scan is OCR'd by
// an external service and arrives via POST /facilities/:id/ocr-import
// instead, never through this script. For future folder/cron automation.
// submittedBy is always null here (no logged-in user) -- a deliberate,
// already-supported case.
//
// Usage: node scripts/ingest-canteen-document.mjs <facility-id> <path-to-file>
//
// Exit codes: 0 = ok, 1 = partial (needs review) or failed.
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';

const [facilityIdArg, filePath] = process.argv.slice(2);
if (!facilityIdArg || !filePath) {
  console.error('Usage: node scripts/ingest-canteen-document.mjs <facility-id> <path-to-file>');
  process.exit(1);
}

const facilityId = Number(facilityIdArg);
if (!Number.isInteger(facilityId)) {
  console.error(`facility-id must be an integer, got: ${facilityIdArg}`);
  process.exit(1);
}

const EXTENSION_MIME_TYPES = {
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const ext = path.extname(filePath).toLowerCase();
const mimeType = EXTENSION_MIME_TYPES[ext];
if (!mimeType) {
  console.error(`Nieobsługiwane rozszerzenie: ${ext || '(brak)'}. Obsługiwane: ${Object.keys(EXTENSION_MIME_TYPES).join(', ')}`);
  process.exit(1);
}

let buffer;
try {
  buffer = await fs.readFile(filePath);
} catch (err) {
  console.error(`Nie udało się odczytać pliku: ${err.message}`);
  process.exit(1);
}

const { ingestCanteenDocument } = await import('../src/services/canteen/canteenIngestion.js');
const { pool } = await import('../src/config/db.js');

const filename = path.basename(filePath);
const result = await ingestCanteenDocument({ facilityId, buffer, filename, mimeType, submittedBy: null });

console.log(`\nPlacówka:   #${facilityId}`);
console.log(`Plik:       ${filename}`);
console.log(`Status:     ${result.status}`);
if (typeof result.confidence === 'number') console.log(`Pewność:    ${result.confidence.toFixed(2)}`);
if (result.linesTotal != null) console.log(`Linie:      ${result.linesParsed}/${result.linesTotal} rozpoznanych`);
if (result.changes?.length) {
  console.log(`Zmiany:     ${result.changes.length}`);
  for (const c of result.changes) {
    const flag = c.flagged ? ` [WSTRZYMANE: ${c.flagReason}]` : '';
    console.log(`  - ${c.type} ${c.normalizedName}${flag}`);
  }
}
if (result.error) console.log(`Błąd:       ${result.error}`);
console.log('');

await pool.end();
process.exit(result.status === 'ok' ? 0 : 1);
