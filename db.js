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
      numeric_id TEXT UNIQUE,
      target TEXT NOT NULL,
      label TEXT DEFAULT '',
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    );
  `);
  // На случай апгрейда с более старой версии базы, где numeric_id ещё не было
  await pool.query(`ALTER TABLE qrcodes ADD COLUMN IF NOT EXISTS numeric_id TEXT;`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS history (
      id SERIAL PRIMARY KEY,
      code TEXT NOT NULL,
      numeric_id TEXT,
      label TEXT DEFAULT '',
      old_target TEXT NOT NULL,
      new_target TEXT NOT NULL,
      changed_at BIGINT NOT NULL
    );
  `);
}

// ---------- Admin ----------

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

// ---------- QR-коды ----------

function generateNumericId() {
  // 8-значный идентификатор, первая цифра 1-9 чтобы не было ведущего нуля
  const first = Math.floor(Math.random() * 9) + 1;
  const rest = Math.floor(Math.random() * 10000000).toString().padStart(7, '0');
  return `${first}${rest}`;
}

async function listCodes({ search = '', limit = 20, offset = 0 } = {}) {
  const params = [];
  let where = '';

  if (search && search.trim()) {
    params.push(`%${search.trim()}%`);
    where = `WHERE label ILIKE $${params.length} OR target ILIKE $${params.length} OR code ILIKE $${params.length} OR numeric_id ILIKE $${params.length}`;
  }

  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const { rows } = await pool.query(
    `SELECT code, numeric_id AS "numericId", target, label, created_at AS "createdAt", updated_at AS "updatedAt",
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
    'SELECT code, numeric_id AS "numericId", target, label, created_at AS "createdAt", updated_at AS "updatedAt" FROM qrcodes WHERE code = $1',
    [code]
  );
  return rows[0] || null;
}

async function createCode(code, target, label) {
  const now = Date.now();
  let numericId;
  let attempts = 0;
  do {
    numericId = generateNumericId();
    attempts++;
    const { rows } = await pool.query('SELECT 1 FROM qrcodes WHERE numeric_id = $1', [numericId]);
    if (rows.length === 0) break;
  } while (attempts < 5);

  await pool.query(
    'INSERT INTO qrcodes (code, numeric_id, target, label, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $5)',
    [code, numericId, target, label || '', now]
  );
  return getCode(code);
}

async function updateCode(code, target, label) {
  const before = await getCode(code);
  if (!before) return null;

  const now = Date.now();
  const { rowCount } = await pool.query(
    'UPDATE qrcodes SET target = $2, label = COALESCE($3, label), updated_at = $4 WHERE code = $1',
    [code, target, label, now]
  );
  if (rowCount === 0) return null;

  const after = await getCode(code);

  // Записываем в историю только если ссылка реально изменилась
  if (before.target !== after.target) {
    await pool.query(
      'INSERT INTO history (code, numeric_id, label, old_target, new_target, changed_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [code, after.numericId, after.label, before.target, after.target, now]
    );
  }

  return after;
}

async function deleteCode(code) {
  const { rowCount } = await pool.query('DELETE FROM qrcodes WHERE code = $1', [code]);
  return rowCount > 0;
}

// ---------- История изменений ----------

async function getHistory({ search = '', limit = 20, offset = 0 } = {}) {
  const params = [];
  let where = '';

  if (search && search.trim()) {
    params.push(`%${search.trim()}%`);
    where = `WHERE label ILIKE $${params.length} OR code ILIKE $${params.length} OR numeric_id ILIKE $${params.length} OR old_target ILIKE $${params.length} OR new_target ILIKE $${params.length}`;
  }

  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const { rows } = await pool.query(
    `SELECT id, code, numeric_id AS "numericId", label, old_target AS "oldTarget", new_target AS "newTarget", changed_at AS "changedAt",
            COUNT(*) OVER() AS "totalCount"
     FROM history
     ${where}
     ORDER BY changed_at DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );

  const total = rows[0] ? Number(rows[0].totalCount) : 0;
  const items = rows.map(({ totalCount, ...rest }) => rest);
  return { items, total };
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
  getHistory,
};
