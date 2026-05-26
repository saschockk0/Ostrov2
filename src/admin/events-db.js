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

async function listEvents(db, activeOnly = false) {
  const where = activeOnly ? 'WHERE active = 1' : '';
  return query(db, `SELECT * FROM events ${where} ORDER BY date ASC, sort_order ASC, id ASC`);
}

async function getEvent(db, id) {
  return getOne(db, 'SELECT * FROM events WHERE id = ?', [id]);
}

async function createEvent(db, data) {
  const r = await run(db, `
    INSERT INTO events (title, description, date, end_date, image_url, active, sort_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    data.title || '',
    data.description || '',
    data.date || null,
    data.end_date || null,
    data.image_url || '',
    data.active !== false ? 1 : 0,
    Number(data.sort_order) || 0,
    new Date().toISOString(),
  ]);
  return getEvent(db, r.lastID);
}

async function updateEvent(db, id, data) {
  const fields = [];
  const params = [];
  const allowed = { title: String, description: String, date: v => v || null, end_date: v => v || null,
    image_url: String, active: v => (v ? 1 : 0), sort_order: Number };
  for (const [key, cast] of Object.entries(allowed)) {
    if (data[key] !== undefined) { fields.push(`${key} = ?`); params.push(cast(data[key])); }
  }
  if (!fields.length) return getEvent(db, id);
  params.push(id);
  await run(db, `UPDATE events SET ${fields.join(', ')} WHERE id = ?`, params);
  return getEvent(db, id);
}

async function deleteEvent(db, id) {
  await run(db, 'DELETE FROM events WHERE id = ?', [id]);
}

module.exports = { listEvents, getEvent, createEvent, updateEvent, deleteEvent };
