const { getDb, run, query, getOne } = require('./libsql-client');

async function initSchema() {
  const db = getDb();
  await db.batch([
    { sql: `CREATE TABLE IF NOT EXISTS reviews_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fetched_at TEXT NOT NULL,
        reviews_json TEXT NOT NULL
      )`, args: [] },
    { sql: `CREATE TABLE IF NOT EXISTS applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL,
        client_type TEXT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        messenger TEXT,
        email TEXT,
        comment TEXT,
        answers_json TEXT NOT NULL,
        quote_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'new',
        manager_note TEXT DEFAULT ''
      )`, args: [] },
    { sql: `CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        date TEXT,
        end_date TEXT,
        image_url TEXT DEFAULT '',
        active INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      )`, args: [] },
    { sql: `CREATE TABLE IF NOT EXISTS content_blocks (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`, args: [] },
    { sql: `CREATE TABLE IF NOT EXISTS gallery_photos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        caption TEXT DEFAULT '',
        active INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      )`, args: [] },
  ], 'deferred');

  try {
    await run(`ALTER TABLE applications ADD COLUMN manager_note TEXT DEFAULT ''`);
  } catch { /* column already exists */ }
}

async function insertApplication(application) {
  const result = await run(`
    INSERT INTO applications (
      created_at, client_type, name, phone, messenger, email,
      comment, answers_json, quote_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    new Date().toISOString(),
    application.clientType || 'individual',
    application.name,
    application.phone,
    application.messenger || '',
    application.email || '',
    application.comment || '',
    JSON.stringify(application.answers || {}),
    JSON.stringify(application.quote || {}),
  ]);
  return result.lastID;
}

module.exports = { initSchema, insertApplication };
