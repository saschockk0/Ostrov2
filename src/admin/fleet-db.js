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

async function listFleet(db, activeOnly = false) {
  const where = activeOnly ? 'WHERE active = 1' : '';
  return query(db, `SELECT * FROM fleet ${where} ORDER BY sort_order ASC, id ASC`);
}

async function getFleetItem(db, id) {
  return getOne(db, 'SELECT * FROM fleet WHERE id = ?', [id]);
}

async function createFleetItem(db, data) {
  const r = await run(db, `
    INSERT INTO fleet (name, kind, image_url, images, count, length_m, sail_area, crew, note, active, sort_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    data.name || '',
    data.kind || '',
    data.image_url || '',
    data.images || '',
    data.count || '',
    data.length_m || '',
    data.sail_area || '',
    data.crew || '',
    data.note || '',
    data.active !== false ? 1 : 0,
    Number(data.sort_order) || 0,
    new Date().toISOString(),
  ]);
  return getFleetItem(db, r.lastID);
}

async function updateFleetItem(db, id, data) {
  const fields = [];
  const params = [];
  const allowed = {
    name: String, kind: String, image_url: String, images: String, count: String,
    length_m: String, sail_area: String, crew: String, note: String,
    active: v => (v ? 1 : 0), sort_order: Number,
  };
  for (const [key, cast] of Object.entries(allowed)) {
    if (data[key] !== undefined) { fields.push(`${key} = ?`); params.push(cast(data[key])); }
  }
  if (!fields.length) return getFleetItem(db, id);
  params.push(id);
  await run(db, `UPDATE fleet SET ${fields.join(', ')} WHERE id = ?`, params);
  return getFleetItem(db, id);
}

async function deleteFleetItem(db, id) {
  await run(db, 'DELETE FROM fleet WHERE id = ?', [id]);
}

module.exports = { listFleet, getFleetItem, createFleetItem, updateFleetItem, deleteFleetItem };
