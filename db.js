// Хранилище на Postgres (рассчитано на бесплатный Neon, но подойдёт
// любой Postgres — просто передайте DATABASE_URL).

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // нужно для Neon и большинства облачных Postgres
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin (
      id INTEGER PRIMARY KEY DEFAULT 1,
      username TEXT NOT NULL,
      password_hash TEXT NOT NULL
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS qrcodes (
      code TEXT PRIMARY KEY,
      target TEXT NOT NULL,
      label TEXT DEFAULT '',
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    );
  `);
}

async function getAdmin() {
  const { rows } = await pool.query('SELECT username, password_hash FROM admin WHERE id = 1');
  if (!rows[0]) return null;
  return { username: rows[0].username, passwordHash: rows[0].password_hash };
}

async function setAdmin(username, passwordHash) {
  await pool.query(
    `INSERT INTO admin (id, username, password_hash) VALUES (1, $1, $2)
     ON CONFLICT (id) DO UPDATE SET username = $1, password_hash = $2`,
    [username, passwordHash]
  );
}

async function listCodes() {
  const { rows } = await pool.query(
    'SELECT code, target, label, created_at AS "createdAt", updated_at AS "updatedAt" FROM qrcodes ORDER BY created_at DESC'
  );
  return rows;
}

async function getCode(code) {
  const { rows } = await pool.query(
    'SELECT code, target, label, created_at AS "createdAt", updated_at AS "updatedAt" FROM qrcodes WHERE code = $1',
    [code]
  );
  return rows[0] || null;
}

async function createCode(code, target, label) {
  const now = Date.now();
  await pool.query(
    'INSERT INTO qrcodes (code, target, label, created_at, updated_at) VALUES ($1, $2, $3, $4, $4)',
// Хранилище на Postgres (рассчитано на бесплатный Neon, но подойдёт
// любой Postgres — просто передайте DATABASE_URL).

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // нужно для Neon и большинства облачных Postgres
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin (
      id INTEGER PRIMARY KEY DEFAULT 1,
      username TEXT NOT NULL,
      password_hash TEXT NOT NULL
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS qrcodes (
      code TEXT PRIMARY KEY,
      target TEXT NOT NULL,
      label TEXT DEFAULT '',
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    );
  `);
}

async function getAdmin() {
  const { rows } = await pool.query('SELECT username, password_hash FROM admin WHERE id = 1');
  if (!rows[0]) return null;
  return { username: rows[0].username, passwordHash: rows[0].password_hash };
}

async function setAdmin(username, passwordHash) {
  await pool.query(
    `INSERT INTO admin (id, username, password_hash) VALUES (1, $1, $2)
     ON CONFLICT (id) DO UPDATE SET username = $1, password_hash = $2`,
    [username, passwordHash]
  );
}

async function listCodes({ search = '', limit = 20, offset = 0 } = {}) {
  const params = [];
  let where = '';

  if (search && search.trim()) {
    params.push(`%${search.trim()}%`);
    where = `WHERE label ILIKE $${params.length} OR target ILIKE $${params.length} OR code ILIKE $${params.length}`;
  }

  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const { rows } = await pool.query(
    `SELECT code, target, label, created_at AS "createdAt", updated_at AS "updatedAt",
            COUNT(*) OVER() AS "totalCount"
     FROM qrcodes
     ${where}
     ORDER BY updated_at DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );

  const total = rows[0] ? Number(rows[0].totalCount) : 0;
  const items = rows.map(({ totalCount, ...rest }) => rest);
  return { items, total };
}

async function getCode(code) {
  const { rows } = await pool.query(
    'SELECT code, target, label, created_at AS "createdAt", updated_at AS "updatedAt" FROM qrcodes WHERE code = $1',
    [code]
  );
  return rows[0] || null;
}

async function createCode(code, target, label) {
  const now = Date.now();
  await pool.query(
    'INSERT INTO qrcodes (code, target, label, created_at, updated_at) VALUES ($1, $2, $3, $4, $4)',
    [code, target, label || '', now]
  );
  return getCode(code);
}

async function updateCode(code, target, label) {
  const now = Date.now();
  const { rowCount } = await pool.query(
    'UPDATE qrcodes SET target = $2, label = COALESCE($3, label), updated_at = $4 WHERE code = $1',
    [code, target, label, now]
  );
  if (rowCount === 0) return null;
  return getCode(code);
}

async function deleteCode(code) {
  const { rowCount } = await pool.query('DELETE FROM qrcodes WHERE code = $1', [code]);
  return rowCount > 0;
}

module.exports = {
  init,
  getAdmin,
  setAdmin,
  listCodes,
  getCode,
  createCode,
  updateCode,
  deleteCode,
};
