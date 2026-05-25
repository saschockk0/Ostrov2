const { createClient } = require('@libsql/client');
const fs = require('fs');
const path = require('path');

let _client = null;

function getDb() {
  if (_client) return _client;
  const url = process.env.TURSO_URL || 'file:data/ostrov.db';
  if (url.startsWith('file:')) {
    const filePath = path.resolve(url.slice(5));
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
  _client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  return _client;
}

async function run(sql, params = []) {
  const result = await getDb().execute({ sql, args: params });
  return { lastID: Number(result.lastInsertRowid) };
}

async function query(sql, params = []) {
  const result = await getDb().execute({ sql, args: params });
  const { columns } = result;
  return result.rows.map(row => {
    const obj = {};
    for (const col of columns) obj[col] = row[col] ?? null;
    return obj;
  });
}

async function getOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

module.exports = { getDb, run, query, getOne };
