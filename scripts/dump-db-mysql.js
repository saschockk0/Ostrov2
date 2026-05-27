/**
 * Экспортирует данные из SQLite в MySQL-совместимый SQL-дамп.
 * Запуск: node scripts/dump-db-mysql.js
 */
const sqlite3 = require('sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'ostrov.sqlite');
const ts = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
const OUT_PATH = path.join(__dirname, '..', 'data', `dump_mysql_${ts}.sql`);

const db = new sqlite3.Database(DB_PATH);

function q(sql, params = []) {
  return new Promise((res, rej) => db.all(sql, params, (e, r) => e ? rej(e) : res(r)));
}

function escapeVal(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  // Экранируем для MySQL: backslash, кавычки, нулевые байты
  return "'" + String(v)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\0/g, '\\0')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r') + "'";
}

// Конвертируем CREATE TABLE из SQLite в MySQL
function convertCreateTable(name, sqliteSQL) {
  let sql = sqliteSQL;

  // INTEGER PRIMARY KEY AUTOINCREMENT -> INT NOT NULL AUTO_INCREMENT
  sql = sql.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'INT NOT NULL AUTO_INCREMENT');
  // AUTOINCREMENT без PRIMARY KEY
  sql = sql.replace(/AUTOINCREMENT/gi, 'AUTO_INCREMENT');
  // Квадратные скобки -> обратные кавычки
  sql = sql.replace(/\[(\w+)\]/g, '`$1`');
  // Имя таблицы
  sql = sql.replace(/CREATE TABLE (\w+)/i, 'CREATE TABLE `$1`');

  // TEXT PRIMARY KEY -> VARCHAR(255) PRIMARY KEY (MySQL не поддерживает TEXT как PK)
  sql = sql.replace(/\bTEXT\s+PRIMARY\s+KEY\b/gi, 'VARCHAR(255) PRIMARY KEY');

  // TEXT с DEFAULT значением -> VARCHAR(255) с DEFAULT
  // MySQL strict mode запрещает DEFAULT для BLOB/TEXT колонок
  sql = sql.replace(/\bTEXT\b(\s+NOT\s+NULL)?\s+DEFAULT\s+'([^']*)'/gi, (match, notNull, def) => {
    const nn = notNull ? ' NOT NULL' : '';
    return `VARCHAR(500)${nn} DEFAULT '${def}'`;
  });

  // Добавляем PRIMARY KEY если его нет после AUTO_INCREMENT
  if (sql.includes('AUTO_INCREMENT') && !sql.includes('PRIMARY KEY')) {
    sql = sql.replace('AUTO_INCREMENT', 'AUTO_INCREMENT PRIMARY KEY');
  }

  // Добавляем ENGINE и charset
  sql = sql.trimEnd().replace(/\)$/, ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');

  return sql;
}

async function dump() {
  const lines = [];

  lines.push('-- MySQL dump generated from SQLite');
  lines.push(`-- Date: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('SET NAMES utf8mb4;');
  lines.push('SET FOREIGN_KEY_CHECKS=0;');
  lines.push('SET SQL_MODE="NO_AUTO_VALUE_ON_ZERO";');
  lines.push('');
  lines.push('START TRANSACTION;');

  const tables = await q(
    "SELECT name, sql FROM sqlite_master WHERE type='table' AND name != 'sqlite_sequence' ORDER BY name"
  );

  let totalRows = 0;

  for (const t of tables) {
    const mysqlCreate = convertCreateTable(t.name, t.sql);

    lines.push('');
    lines.push(`-- --------------------------------------------------------`);
    lines.push(`-- Таблица: \`${t.name}\``);
    lines.push(`-- --------------------------------------------------------`);
    lines.push('');
    lines.push(`DROP TABLE IF EXISTS \`${t.name}\`;`);
    lines.push(`${mysqlCreate};`);

    const rows = await q(`SELECT * FROM [${t.name}]`);
    totalRows += rows.length;

    if (rows.length > 0) {
      lines.push('');
      const cols = Object.keys(rows[0]).map(c => `\`${c}\``).join(', ');
      for (const row of rows) {
        const vals = Object.values(row).map(escapeVal).join(', ');
        lines.push(`INSERT INTO \`${t.name}\` (${cols}) VALUES (${vals});`);
      }
    }
  }

  lines.push('');
  lines.push('COMMIT;');
  lines.push('');
  lines.push('SET FOREIGN_KEY_CHECKS=1;');

  fs.writeFileSync(OUT_PATH, lines.join('\n'), 'utf8');
  console.log(`Дамп сохранён: ${OUT_PATH}`);
  console.log(`Таблиц: ${tables.length}, строк всего: ${totalRows}`);
}

dump()
  .catch(err => { console.error('Ошибка:', err); process.exit(1); })
  .finally(() => db.close());
