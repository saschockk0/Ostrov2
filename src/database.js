const path = require("path");
const sqlite3 = require("sqlite3");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data", "ostrov.sqlite");

function openDb() {
  return new sqlite3.Database(DB_PATH);
}

function initDb() {
  const db = openDb();
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS applications (
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
        status TEXT NOT NULL DEFAULT 'new'
      )
    `);
  });
  return db;
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

async function insertApplication(db, application) {
  const sql = `
    INSERT INTO applications (
      created_at,
      client_type,
      name,
      phone,
      messenger,
      email,
      comment,
      answers_json,
      quote_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const params = [
    new Date().toISOString(),
    application.clientType || "individual",
    application.name,
    application.phone,
    application.messenger || "",
    application.email || "",
    application.comment || "",
    JSON.stringify(application.answers || {}),
    JSON.stringify(application.quote || {}),
  ];
  const result = await run(db, sql, params);
  return result.lastID;
}

module.exports = {
  initDb,
  insertApplication,
};
