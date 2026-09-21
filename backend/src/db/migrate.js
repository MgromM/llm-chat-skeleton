import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { logger } from '../config/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, 'migrations');

// Deliberately its own pool on DATABASE_URL (the owner/superuser role), not
// the app's shared pool from config/db.js -- that one connects as the
// restricted salesmore_app role (point 6, migration 026), which can't
// CREATE ROLE/GRANT/ALTER TABLE ... ENABLE ROW LEVEL SECURITY.
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = await readFile(path.join(migrationsDir, file), 'utf8');
    logger.info(`Running migration ${file}`);
    await pool.query(sql);
  }
  logger.info('Migrations complete');
  await pool.end();
}

run().catch((err) => {
  logger.error('Migration failed', { error: err.message });
  process.exit(1);
});
