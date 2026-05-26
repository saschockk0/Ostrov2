'use strict';

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
function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
  });
}

function listPhotos(db, onlyActive = false) {
  const where = onlyActive ? 'WHERE active = 1' : '';
  return query(db, `SELECT * FROM gallery_photos ${where} ORDER BY sort_order ASC, id ASC`);
}

function getPhoto(db, id) {
  return get(db, 'SELECT * FROM gallery_photos WHERE id = ?', [id]);
}

async function createPhoto(db, { url, caption = '', active = true, sort_order = 0 }) {
  const now = new Date().toISOString();
  const r = await run(db,
    `INSERT INTO gallery_photos (url, caption, active, sort_order, created_at) VALUES (?, ?, ?, ?, ?)`,
    [url, caption, active ? 1 : 0, sort_order, now]
  );
  return getPhoto(db, r.lastID);
}

async function updatePhoto(db, id, patch) {
  const allowed = ['caption', 'active', 'sort_order'];
  const sets = [], vals = [];
  for (const key of allowed) {
    if (patch[key] !== undefined) {
      sets.push(`${key} = ?`);
      vals.push(key === 'active' ? (patch[key] ? 1 : 0) : patch[key]);
    }
  }
  if (!sets.length) return getPhoto(db, id);
  vals.push(id);
  await run(db, `UPDATE gallery_photos SET ${sets.join(', ')} WHERE id = ?`, vals);
  return getPhoto(db, id);
}

async function deletePhoto(db, id) {
  await run(db, 'DELETE FROM gallery_photos WHERE id = ?', [id]);
}

module.exports = { listPhotos, getPhoto, createPhoto, updatePhoto, deletePhoto };
