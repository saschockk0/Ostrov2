const { resourceLabel } = require('../availability');

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) { err ? reject(err) : resolve(this); });
  });
}
function query(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  });
}

function toCapacity(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

async function listInventory(db) {
  const rows = await query(db, 'SELECT resource_key, kind, capacity, sort_order FROM inventory ORDER BY sort_order ASC, resource_key ASC');
  return rows.map((r) => ({ ...r, label: resourceLabel(r.resource_key) }));
}

// Обновляет ёмкости существующих ресурсов. items: [{ resource_key, capacity }].
// Новые ключи не создаём — набор ресурсов фиксирован сидом.
async function saveInventory(db, items) {
  const now = new Date().toISOString();
  for (const item of items || []) {
    if (!item || !item.resource_key) continue;
    await run(db, 'UPDATE inventory SET capacity = ?, updated_at = ? WHERE resource_key = ?',
      [toCapacity(item.capacity), now, String(item.resource_key)]);
  }
  return listInventory(db);
}

module.exports = { listInventory, saveInventory };
