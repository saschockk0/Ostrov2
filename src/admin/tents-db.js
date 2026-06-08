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

async function listTents(db, activeOnly = false) {
  const where = activeOnly ? 'WHERE active = 1' : '';
  return query(db, `SELECT * FROM tents ${where} ORDER BY sort_order ASC, id ASC`);
}

async function getTentItem(db, id) {
  return getOne(db, 'SELECT * FROM tents WHERE id = ?', [id]);
}

async function createTentItem(db, data) {
  const r = await run(db, `
    INSERT INTO tents (name, price_key, image_url, images, length_m, capacity, note, active, sort_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    data.name || '',
    data.price_key || '',
    data.image_url || '',
    data.images || '',
    data.length_m || '',
    data.capacity || '',
    data.note || '',
    data.active !== false ? 1 : 0,
    Number(data.sort_order) || 0,
    new Date().toISOString(),
  ]);
  return getTentItem(db, r.lastID);
}

async function updateTentItem(db, id, data) {
  const fields = [];
  const params = [];
  const allowed = {
    name: String, price_key: String, image_url: String, images: String,
    length_m: String, capacity: String, note: String,
    active: v => (v ? 1 : 0), sort_order: Number,
  };
  for (const [key, cast] of Object.entries(allowed)) {
    if (data[key] !== undefined) { fields.push(`${key} = ?`); params.push(cast(data[key])); }
  }
  if (!fields.length) return getTentItem(db, id);
  params.push(id);
  await run(db, `UPDATE tents SET ${fields.join(', ')} WHERE id = ?`, params);
  return getTentItem(db, id);
}

async function deleteTentItem(db, id) {
  await run(db, 'DELETE FROM tents WHERE id = ?', [id]);
}

module.exports = { listTents, getTentItem, createTentItem, updateTentItem, deleteTentItem };
