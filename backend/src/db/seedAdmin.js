// One-off bootstrap: creates the first admin account so someone can log in
// and start using POST /register for everyone else. Run with:
//   SEED_ADMIN_EMAIL=you@salesmore.pl npm run seed:admin
import 'dotenv/config';
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { pool } from '../config/db.js';
import { logger } from '../config/logger.js';

async function run() {
  const email = process.env.SEED_ADMIN_EMAIL;
  if (!email) {
    throw new Error('SEED_ADMIN_EMAIL env var is required');
  }

  const password = crypto.randomBytes(32).toString('hex');
  const passwordHash = await bcrypt.hash(password, 12);

  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, role)
     VALUES ($1, $2, 'admin')
     ON CONFLICT (email) DO UPDATE SET role = 'admin'
     RETURNING id, email, role`,
    [email, passwordHash],
  );

  logger.info('Admin user ready', { user: rows[0] });
  await pool.end();
}

run().catch((err) => {
  logger.error('Seed admin failed', { error: err.message });
  process.exit(1);
});
