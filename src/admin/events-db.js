const { run, query, getOne } = require('../libsql-client');

async function listEvents(activeOnly = false) {
  const where = activeOnly ? 'WHERE active = 1' : '';
  return query(`SELECT * FROM events ${where} ORDER BY date ASC, sort_order ASC, id ASC`);
}

async function getEvent(id) {
  return getOne('SELECT * FROM events WHERE id = ?', [id]);
}

async function createEvent(data) {
  const r = await run(`
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
  return getEvent(r.lastID);
}

async function updateEvent(id, data) {
  const fields = [];
  const params = [];
  const allowed = {
    title: String, description: String,
    date: v => v || null, end_date: v => v || null,
    image_url: String, active: v => (v ? 1 : 0), sort_order: Number,
  };
  for (const [key, cast] of Object.entries(allowed)) {
    if (data[key] !== undefined) { fields.push(`${key} = ?`); params.push(cast(data[key])); }
  }
  if (!fields.length) return getEvent(id);
  params.push(id);
  await run(`UPDATE events SET ${fields.join(', ')} WHERE id = ?`, params);
  return getEvent(id);
}

async function deleteEvent(id) {
  await run('DELETE FROM events WHERE id = ?', [id]);
}

module.exports = { listEvents, getEvent, createEvent, updateEvent, deleteEvent };
