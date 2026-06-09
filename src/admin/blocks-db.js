function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) { err ? reject(err) : resolve(this); });
  });
}
function getOne(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
  });
}
function query(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  });
}

// Блокировки, пересекающие окно [from, to). Без окна — все, по дате начала.
async function listBlocks(db, { from, to } = {}) {
  if (from && to) {
    return query(db, 'SELECT * FROM date_blocks WHERE start_date < ? AND end_date > ? ORDER BY start_date ASC, id ASC', [to, from]);
  }
  return query(db, 'SELECT * FROM date_blocks ORDER BY start_date ASC, id ASC');
}

async function createBlock(db, data) {
  const r = await run(db, `
    INSERT INTO date_blocks (resource_key, start_date, end_date, qty, reason, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [
    String(data.resource_key || 'all'),
    String(data.start_date),
    String(data.end_date),
    Math.max(0, Math.floor(Number(data.qty) || 0)),
    String(data.reason || '').slice(0, 255),
    new Date().toISOString(),
  ]);
  return getOne(db, 'SELECT * FROM date_blocks WHERE id = ?', [r.lastID]);
}

async function deleteBlock(db, id) {
  await run(db, 'DELETE FROM date_blocks WHERE id = ?', [id]);
}

module.exports = { listBlocks, createBlock, deleteBlock };
