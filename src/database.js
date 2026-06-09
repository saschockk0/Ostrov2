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
    CREATE TABLE IF NOT EXISTS fleet (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(255) NOT NULL,
      kind VARCHAR(100) NOT NULL DEFAULT '',
      image_url VARCHAR(500),
      count VARCHAR(20),
      length_m VARCHAR(50),
      sail_area VARCHAR(50),
      crew VARCHAR(50),
      note TEXT,
      active INT NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
      created_at VARCHAR(30) NOT NULL
    )
  `);
  // Additional fleet photos (one URL per line); main photo stays in image_url
  db.run("ALTER TABLE fleet ADD COLUMN images TEXT", [], function (err) {});
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
  db.run(`
    CREATE TABLE IF NOT EXISTS map_points (
      id INT PRIMARY KEY AUTO_INCREMENT,
      num INT NOT NULL DEFAULT 0,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      category VARCHAR(50) NOT NULL DEFAULT 'infra',
      lat DOUBLE NOT NULL,
      lng DOUBLE NOT NULL,
      image_url VARCHAR(500),
      active INT NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
      created_at VARCHAR(30) NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS tents (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(255) NOT NULL,
      price_key VARCHAR(50) NOT NULL DEFAULT '',
      image_url VARCHAR(500),
      images TEXT,
      length_m VARCHAR(50),
      capacity VARCHAR(50),
      note TEXT,
      active INT NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
      created_at VARCHAR(30) NOT NULL
    )
  `);
  // Seed the four canopy options once (keep the calculator working out of the box)
  seedTents(db);
  // Учёт наличия: ёмкость ресурсов (места в лагере, арендные палатки, шатры-кухни).
  // resource_key совпадает с ключами perDay в answers_json (campSpots — особый: гости = adults+children).
  db.run(`
    CREATE TABLE IF NOT EXISTS inventory (
      resource_key VARCHAR(50) PRIMARY KEY,
      kind         VARCHAR(30) NOT NULL DEFAULT 'item',
      capacity     INT NOT NULL DEFAULT 0,
      sort_order   INT NOT NULL DEFAULT 0,
      updated_at   VARCHAR(30) NOT NULL
    )
  `);
  seedInventory(db);
  // Ручные блокировки/брони: снимают qty единиц ресурса на каждый день [start,end).
  // resource_key='all' = дата закрыта целиком.
  db.run(`
    CREATE TABLE IF NOT EXISTS date_blocks (
      id           INT PRIMARY KEY AUTO_INCREMENT,
      resource_key VARCHAR(50) NOT NULL,
      start_date   VARCHAR(30) NOT NULL,
      end_date     VARCHAR(30) NOT NULL,
      qty          INT NOT NULL DEFAULT 0,
      reason       VARCHAR(255),
      created_at   VARCHAR(30) NOT NULL
    )
  `);
  // Предоплаты по СБП (ЮKassa). Суммы храним в копейках, чтобы не терять точность на float.
  db.run(`
    CREATE TABLE IF NOT EXISTS payments (
      id INT PRIMARY KEY AUTO_INCREMENT,
      application_id INT NOT NULL,
      yookassa_id VARCHAR(64),
      amount_kopecks INT NOT NULL,
      currency VARCHAR(3) NOT NULL DEFAULT 'RUB',
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      description VARCHAR(255),
      confirmation_url VARCHAR(500),
      source VARCHAR(20) NOT NULL DEFAULT 'auto',
      created_at VARCHAR(30) NOT NULL,
      paid_at VARCHAR(30),
      refunded_at VARCHAR(30),
      metadata_json TEXT,
      raw_event_json TEXT,
      INDEX idx_app (application_id),
      INDEX idx_yk (yookassa_id)
    )
  `);
  // Сумма успешно оплаченного по заявке (агрегат по succeeded-платежам).
  db.run("ALTER TABLE applications ADD COLUMN paid_amount_kopecks INT NOT NULL DEFAULT 0", [], function (err) {});
  return db;
}

// Default tent rows mapped to the fixed pricing keys in data/prices.json.
// Inserted only when the table is empty so admin edits are never overwritten.
function seedTents(db) {
  const defaults = [
    { name: "Кухня малая",        price_key: "canopySmall",   capacity: "до 8 чел.",    note: "от 600 ₽/сутки",   sort_order: 1 },
    { name: "Кухня средняя",      price_key: "canopyMedium",  capacity: "",             note: "от 1 600 ₽/сутки", sort_order: 2 },
    { name: "Кухня большая",      price_key: "canopyLarge",   capacity: "20–25 чел.",   note: "от 3 000 ₽/сутки", sort_order: 3 },
    { name: "Кухня-шатёр «Эверест»", price_key: "canopyEverest", capacity: "",          note: "от 4 000 ₽/сутки", sort_order: 4 },
  ];
  db.get("SELECT COUNT(*) AS c FROM tents", [], function onCount(err, row) {
    if (err || !row || row.c > 0) return;
    const now = new Date().toISOString();
    defaults.forEach(function (t) {
      db.run(
        "INSERT INTO tents (name, price_key, image_url, images, length_m, capacity, note, active, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [t.name, t.price_key, "", "", "", t.capacity, t.note, 1, t.sort_order, now],
        function () {}
      );
    });
  });
}

// Default capacities, inserted only when the table is empty so admin edits survive restarts.
// Keys mirror perDay keys in answers_json; campSpots is the total island guest limit.
function seedInventory(db) {
  const defaults = [
    { resource_key: "campSpots",     kind: "camp",   capacity: 100, sort_order: 1 },
    { resource_key: "tent1",         kind: "tent",   capacity: 10,  sort_order: 2 },
    { resource_key: "tent2",         kind: "tent",   capacity: 15,  sort_order: 3 },
    { resource_key: "tent3",         kind: "tent",   capacity: 8,   sort_order: 4 },
    { resource_key: "canopyEverest", kind: "canopy", capacity: 1,   sort_order: 5 },
    { resource_key: "canopyLarge",   kind: "canopy", capacity: 1,   sort_order: 6 },
    { resource_key: "canopyMedium",  kind: "canopy", capacity: 1,   sort_order: 7 },
    { resource_key: "canopySmall",   kind: "canopy", capacity: 1,   sort_order: 8 },
  ];
  db.get("SELECT COUNT(*) AS c FROM inventory", [], function onCount(err, row) {
    if (err || !row || row.c > 0) return;
    const now = new Date().toISOString();
    defaults.forEach(function (r) {
      db.run(
        "INSERT INTO inventory (resource_key, kind, capacity, sort_order, updated_at) VALUES (?, ?, ?, ?, ?)",
        [r.resource_key, r.kind, r.capacity, r.sort_order, now],
        function () {}
      );
    });
  });
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
