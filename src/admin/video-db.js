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

function listVideos(db, onlyActive = false) {
  const where = onlyActive ? 'WHERE active = 1' : '';
  return query(db, `SELECT * FROM videos ${where} ORDER BY sort_order ASC, id ASC`);
}

function getVideo(db, id) {
  return get(db, 'SELECT * FROM videos WHERE id = ?', [id]);
}

async function createVideo(db, { url, poster = '', caption = '', active = true, sort_order = 0 }) {
  const now = new Date().toISOString();
  const r = await run(db,
    `INSERT INTO videos (url, poster, caption, active, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [url, poster, caption, active ? 1 : 0, sort_order, now]
  );
  return getVideo(db, r.lastID);
}

async function updateVideo(db, id, patch) {
  const allowed = ['caption', 'poster', 'active', 'sort_order'];
  const sets = [], vals = [];
  for (const key of allowed) {
    if (patch[key] !== undefined) {
      sets.push(`${key} = ?`);
      vals.push(key === 'active' ? (patch[key] ? 1 : 0) : patch[key]);
    }
  }
  if (!sets.length) return getVideo(db, id);
  vals.push(id);
  await run(db, `UPDATE videos SET ${sets.join(', ')} WHERE id = ?`, vals);
  return getVideo(db, id);
}

async function deleteVideo(db, id) {
  await run(db, 'DELETE FROM videos WHERE id = ?', [id]);
}

module.exports = { listVideos, getVideo, createVideo, updateVideo, deleteVideo };
