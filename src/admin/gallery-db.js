const { run, query, getOne } = require('../libsql-client');

function listPhotos(onlyActive = false) {
  const where = onlyActive ? 'WHERE active = 1' : '';
  return query(`SELECT * FROM gallery_photos ${where} ORDER BY sort_order ASC, id ASC`);
}

function getPhoto(id) {
  return getOne('SELECT * FROM gallery_photos WHERE id = ?', [id]);
}

async function createPhoto({ url, caption = '', active = true, sort_order = 0 }) {
  const now = new Date().toISOString();
  const r = await run(
    `INSERT INTO gallery_photos (url, caption, active, sort_order, created_at) VALUES (?, ?, ?, ?, ?)`,
    [url, caption, active ? 1 : 0, sort_order, now]
  );
  return getPhoto(r.lastID);
}

async function updatePhoto(id, patch) {
  const allowed = ['caption', 'active', 'sort_order'];
  const sets = [], vals = [];
  for (const key of allowed) {
    if (patch[key] !== undefined) {
      sets.push(`${key} = ?`);
      vals.push(key === 'active' ? (patch[key] ? 1 : 0) : patch[key]);
    }
  }
  if (!sets.length) return getPhoto(id);
  vals.push(id);
  await run(`UPDATE gallery_photos SET ${sets.join(', ')} WHERE id = ?`, vals);
  return getPhoto(id);
}

async function deletePhoto(id) {
  await run('DELETE FROM gallery_photos WHERE id = ?', [id]);
}

module.exports = { listPhotos, getPhoto, createPhoto, updatePhoto, deletePhoto };
