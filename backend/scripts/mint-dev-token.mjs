// One-off local dev helper: mints a JWT for manual smoke testing without
// going through Google OAuth. Not used in prod, not committed to git config.
import 'dotenv/config';
import jwt from 'jsonwebtoken';

const email = process.argv[2];
const role = process.argv[3] || 'admin';
if (!email) {
  console.error('Usage: node scripts/mint-dev-token.mjs <email> [role]');
  process.exit(1);
}

const { pool } = await import('../src/config/db.js');
const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
if (!rows.length) {
  console.error(`No user with email ${email}`);
  process.exit(1);
}

const token = jwt.sign({ sub: rows[0].id, email, role }, process.env.JWT_SECRET, { expiresIn: '12h' });
console.log(token);
await pool.end();
