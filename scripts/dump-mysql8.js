const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'ostrov.db');
const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);

function dbAll(sql) {
  return new Promise((resolve, reject) => {
    db.all(sql, (err, rows) => err ? reject(err) : resolve(rows));
  });
}

function sqliteTypeToMySQL(colType) {
  if (!colType) return 'TEXT';
  const t = colType.toUpperCase();
  if (t.includes('INTEGER') || t === 'INT') return 'INT';
  if (t.includes('REAL') || t.includes('FLOAT') || t.includes('DOUBLE')) return 'DOUBLE';
  if (t.includes('BLOB')) return 'BLOB';
  if (t.includes('BOOLEAN')) return 'TINYINT(1)';
  if (t.includes('DATETIME') || t.includes('TIMESTAMP')) return 'DATETIME';
  if (t.includes('DATE')) return 'DATE';
  if (t.includes('TEXT')) return 'TEXT';
  if (t.includes('VARCHAR')) return colType;
  return 'TEXT';
}

function escapeValue(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? '1' : '0';
  const str = String(val)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\0/g, '\\0');
  return "'" + str + "'";
}

async function main() {
  const tables = await dbAll("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");

  let dump = '';
  dump += '-- MySQL 8.0 compatible dump (converted from SQLite)\n';
  dump += '-- Generated: ' + new Date().toISOString() + '\n';
  dump += '-- Source: ostrov.db\n\n';
  dump += 'SET NAMES utf8mb4;\n';
  dump += 'SET CHARACTER SET utf8mb4;\n';
  dump += 'SET FOREIGN_KEY_CHECKS = 0;\n';
  dump += 'SET SQL_MODE = \'NO_AUTO_VALUE_ON_ZERO\';\n\n';

  for (const table of tables) {
    const tableName = table.name;
    const columns = await dbAll(`PRAGMA table_info('${tableName}')`);
    const indexes = await dbAll(`PRAGMA index_list('${tableName}')`);

    dump += `-- ----------------------------\n`;
    dump += `-- Table: ${tableName}\n`;
    dump += `-- ----------------------------\n`;
    dump += `DROP TABLE IF EXISTS \`${tableName}\`;\n`;
    dump += `CREATE TABLE \`${tableName}\` (\n`;

    const colDefs = [];
    const pkCols = [];

    for (const col of columns) {
      let mysqlType = sqliteTypeToMySQL(col.type);
      const hasDefault = col.dflt_value !== null && !col.pk;

      // MySQL 8 strict mode: TEXT/BLOB columns can't have DEFAULT values
      // Convert to VARCHAR(255) if the column has a default, or if it's a
      // short-string field (status, phone, email, url, key, etc.)
      if (mysqlType === 'TEXT' && hasDefault) {
        mysqlType = 'VARCHAR(255)';
      }

      let def = `  \`${col.name}\` ${mysqlType}`;

      if (col.notnull) def += ' NOT NULL';

      if (col.pk && mysqlType === 'INT') {
        def += ' AUTO_INCREMENT';
      }

      if (hasDefault) {
        let dv = col.dflt_value;
        if (dv === 'CURRENT_TIMESTAMP') {
          def += ' DEFAULT CURRENT_TIMESTAMP';
        } else {
          def += ` DEFAULT ${dv}`;
        }
      }

      colDefs.push(def);
      if (col.pk) pkCols.push(col.name);
    }

    if (pkCols.length > 0) {
      const pkDefs = pkCols.map(c => {
        const col = columns.find(x => x.name === c);
        const t = sqliteTypeToMySQL(col.type);
        // MySQL requires prefix length for TEXT PKs
        if (t === 'TEXT') return '`' + c + '`(191)';
        return '`' + c + '`';
      });
      colDefs.push(`  PRIMARY KEY (${pkDefs.join(', ')})`);
    }

    for (const idx of indexes) {
      if (idx.unique && !idx.name.startsWith('sqlite_')) {
        const idxInfo = await dbAll(`PRAGMA index_info('${idx.name}')`);
        const idxCols = idxInfo.map(i => '`' + i.name + '`').join(', ');
        colDefs.push(`  UNIQUE KEY \`${idx.name}\` (${idxCols})`);
      }
    }

    dump += colDefs.join(',\n');
    dump += `\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;\n\n`;

    // Dump data
    const rows = await dbAll(`SELECT * FROM '${tableName}'`);
    if (rows.length > 0) {
      const colNames = columns.map(c => '`' + c.name + '`').join(', ');
      const batchSize = 100;

      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        dump += `INSERT INTO \`${tableName}\` (${colNames}) VALUES\n`;

        const valueRows = batch.map(row => {
          const vals = columns.map(col => escapeValue(row[col.name]));
          return `(${vals.join(', ')})`;
        });

        dump += valueRows.join(',\n') + ';\n\n';
      }
    }
  }

  dump += 'SET FOREIGN_KEY_CHECKS = 1;\n';

  const outPath = path.join(__dirname, '..', 'data', `dump_mysql8_${new Date().toISOString().slice(0, 10)}.sql`);
  fs.writeFileSync(outPath, dump, 'utf8');

  console.log('Tables dumped:', tables.map(t => t.name).join(', '));
  console.log('Output:', outPath);

  const stats = fs.statSync(outPath);
  console.log('Size:', (stats.size / 1024).toFixed(1) + ' KB');

  db.close();
}

main().catch(err => { console.error(err); process.exit(1); });
