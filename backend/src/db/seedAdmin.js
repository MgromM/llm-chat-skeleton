import 'dotenv/config';
import bcrypt from 'bcrypt';
import { pool } from '../config/db.js';

// One-off script to bootstrap the first admin account, since /auth/register
// requires an existing admin. Usage: node src/db/seedAdmin.js <email> <password>
const [, , email, password] = process.argv;

if (!email || !password) {
  console.error('Usage: node src/db/seedAdmin.js <email> <password>');
  process.exit(1);
}

const passwordHash = await bcrypt.hash(password, 12);
await pool.query(
  `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'admin')
   ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'admin'`,
  [email, passwordHash],
);
console.log(`Admin account ready: ${email}`);
await pool.end();
