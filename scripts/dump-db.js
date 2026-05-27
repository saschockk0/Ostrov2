const sqlite3 = require('sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'ostrov.sqlite');
const ts = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
const OUT_PATH = path.join(__dirname, '..', 'data', `dump_${ts}.sql`);

const db = new sqlite3.Database(DB_PATH);

function q(sql, params = []) {
  return new Promise((res, rej) => db.all(sql, params, (e, r) => e ? rej(e) : res(r)));
}

function escapeVal(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  return "'" + String(v).replace(/'/g, "''") + "'";
}

async function dump() {
  const lines = [];
  lines.push('PRAGMA foreign_keys=OFF;');
  lines.push('BEGIN TRANSACTION;');

  const tables = await q(
    "SELECT name, sql FROM sqlite_master WHERE type='table' AND name != 'sqlite_sequence' ORDER BY name"
  );

  let totalRows = 0;

  for (const t of tables) {
    lines.push('');
    lines.push(`-- Table: ${t.name}`);
    lines.push(`DROP TABLE IF EXISTS [${t.name}];`);
    lines.push(`${t.sql};`);

    const rows = await q(`SELECT * FROM [${t.name}]`);
    totalRows += rows.length;

    for (const row of rows) {
      const cols = Object.keys(row).map(c => `[${c}]`).join(', ');
      const vals = Object.values(row).map(escapeVal).join(', ');
      lines.push(`INSERT INTO [${t.name}] (${cols}) VALUES (${vals});`);
    }
  }

  lines.push('');
  lines.push('COMMIT;');

  fs.writeFileSync(OUT_PATH, lines.join('\n'), 'utf8');
  console.log(`Дамп сохранён: ${OUT_PATH}`);
  console.log(`Таблиц: ${tables.length}, строк всего: ${totalRows}`);
}

dump()
  .catch(err => { console.error('Ошибка:', err); process.exit(1); })
  .finally(() => db.close());
