const mysql = require("mysql2");

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASS || "",
  database: process.env.DB_NAME || "ostrov",
  charset: "utf8mb4",
  waitForConnections: true,
  connectionLimit: 10,
});

// Wrapper: expose .run(), .all(), .get() like sqlite3 so existing code works unchanged
const db = {
  run(sql, params, cb) {
    if (typeof params === "function") { cb = params; params = []; }
    pool.query(sql, params || [], function (err, result) {
      if (err) return cb ? cb(err) : undefined;
      const ctx = { lastID: result.insertId, changes: result.affectedRows };
      if (cb) cb.call(ctx, null);
    });
  },
  all(sql, params, cb) {
    if (typeof params === "function") { cb = params; params = []; }
    pool.query(sql, params || [], (err, rows) => {
      if (err) return cb(err);
      cb(null, rows);
    });
  },
  get(sql, params, cb) {
    if (typeof params === "function") { cb = params; params = []; }
    pool.query(sql, params || [], (err, rows) => {
      if (err) return cb(err);
      cb(null, rows[0] || null);
    });
  },
  serialize(fn) { fn(); },
};

function openDb() {
  return db;
}

function initDb() {
  db.run(`
    CREATE TABLE IF NOT EXISTS reviews_cache (
      id INT PRIMARY KEY AUTO_INCREMENT,
      fetched_at TEXT NOT NULL,
      reviews_json TEXT NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS applications (
      id INT PRIMARY KEY AUTO_INCREMENT,
      created_at VARCHAR(30) NOT NULL,
      client_type VARCHAR(50) NOT NULL,
      name VARCHAR(255) NOT NULL,
      phone VARCHAR(50) NOT NULL,
      messenger VARCHAR(100),
      email VARCHAR(255),
      comment TEXT,
      answers_json TEXT NOT NULL,
      quote_json TEXT NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'new',
      manager_note TEXT
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS events (
      id INT PRIMARY KEY AUTO_INCREMENT,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      date VARCHAR(30),
      end_date VARCHAR(30),
      image_url VARCHAR(500),
      kind VARCHAR(50) NOT NULL DEFAULT 'season',
      spots VARCHAR(100),
      active INT NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
      created_at VARCHAR(30) NOT NULL
    )
  `);
  db.run("ALTER TABLE events ADD COLUMN kind VARCHAR(50) NOT NULL DEFAULT 'season'", [], function(err) {});
  db.run("ALTER TABLE events ADD COLUMN spots VARCHAR(100)", [], function(err) {});
  db.run(`
    CREATE TABLE IF NOT EXISTS content_blocks (
      \`key\` VARCHAR(191) PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at VARCHAR(30) NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS gallery_photos (
      id INT PRIMARY KEY AUTO_INCREMENT,
      url VARCHAR(500) NOT NULL,
      caption VARCHAR(500),
      active INT NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
      created_at VARCHAR(30) NOT NULL
    )
  `);
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
      created_at, client_type, name, phone,
      messenger, email, comment, answers_json, quote_json
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

module.exports = { initDb, insertApplication };
