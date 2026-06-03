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

// Стартовый набор точек (переносится из public/js/island-plan-data.js).
// Сидится один раз, если таблица пустая; далее всё редактируется из админки.
const DEFAULT_MAP_POINTS = [
  { num: 1,  name: 'Причал',              category: 'nav',     lat: 56.6934, lng: 36.3820 },
  { num: 2,  name: 'Штаб',                category: 'infra',   lat: 56.6930, lng: 36.3826 },
  { num: 3,  name: 'BOSS',                category: 'infra',   lat: 56.6924, lng: 36.3818 },
  { num: 4,  name: 'Шатёр',               category: 'camp',    lat: 56.6918, lng: 36.3824 },
  { num: 5,  name: '2-й выход',           category: 'nav',     lat: 56.6912, lng: 36.3815 },
  { num: 6,  name: 'Шатёр',               category: 'camp',    lat: 56.6921, lng: 36.3828 },
  { num: 7,  name: 'Шатёр',               category: 'camp',    lat: 56.6926, lng: 36.3832 },
  { num: 8,  name: 'Спасательные жилеты', category: 'safety',  lat: 56.6932, lng: 36.3836 },
  { num: 9,  name: 'Баня',                category: 'leisure', lat: 56.6937, lng: 36.3834 },
  { num: 10, name: 'Склад',               category: 'infra',   lat: 56.6935, lng: 36.3840 },
  { num: 11, name: 'Склад',               category: 'infra',   lat: 56.6934, lng: 36.3844 },
  { num: 12, name: 'Кухня',               category: 'food',    lat: 56.6934, lng: 36.3850 },
  { num: 13, name: 'Вода',                category: 'infra',   lat: 56.6926, lng: 36.3845 },
  { num: 14, name: 'Эверест',             category: 'leisure', lat: 56.6924, lng: 36.3852 },
  { num: 15, name: 'Шатёр',               category: 'camp',    lat: 56.6920, lng: 36.3830 },
  { num: 16, name: 'Туалет',              category: 'infra',   lat: 56.6916, lng: 36.3870 },
  { num: 17, name: 'Туалет',              category: 'infra',   lat: 56.6918, lng: 36.3866 },
  { num: 18, name: 'Туалет',              category: 'infra',   lat: 56.6910, lng: 36.3868 },
  { num: 19, name: 'Туалет',              category: 'infra',   lat: 56.6908, lng: 36.3872 },
  { num: 20, name: 'Туалет',              category: 'infra',   lat: 56.6907, lng: 36.3878 },
  { num: 21, name: 'Палатка',             category: 'camp',    lat: 56.6902, lng: 36.3890 },
  { num: 22, name: 'Палатка Саши-Лёши',   category: 'camp',    lat: 56.6901, lng: 36.3896 },
  { num: 23, name: 'Шатёр',               category: 'camp',    lat: 56.6893, lng: 36.3910 },
  { num: 24, name: 'Шатёр',               category: 'camp',    lat: 56.6882, lng: 36.3940 },
  { num: 25, name: 'Стоп-знак',           category: 'nav',     lat: 56.6878, lng: 36.3960 },
];

// Создаёт таблицу (если нет) и наполняет дефолтными точками при первом запуске.
// Вызывается с await из server.js, поэтому порядок операций гарантирован.
async function ensureMapPoints(db) {
  await run(db, `
    CREATE TABLE IF NOT EXISTS map_points (
      id INT PRIMARY KEY AUTO_INCREMENT,
      num INT NOT NULL DEFAULT 0,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      category VARCHAR(50) NOT NULL DEFAULT 'infra',
      lat DOUBLE NOT NULL,
      lng DOUBLE NOT NULL,
      image_url VARCHAR(500),
      active INT NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
      created_at VARCHAR(30) NOT NULL
    )
  `);
  const row = await getOne(db, 'SELECT COUNT(*) AS c FROM map_points');
  if (row && Number(row.c) > 0) return;
  for (const p of DEFAULT_MAP_POINTS) {
    await createMapPoint(db, { ...p, sort_order: p.num });
  }
}

async function listMapPoints(db, activeOnly = false) {
  const where = activeOnly ? 'WHERE active = 1' : '';
  return query(db, `SELECT * FROM map_points ${where} ORDER BY sort_order ASC, num ASC, id ASC`);
}

async function getMapPoint(db, id) {
  return getOne(db, 'SELECT * FROM map_points WHERE id = ?', [id]);
}

async function createMapPoint(db, data) {
  const r = await run(db, `
    INSERT INTO map_points (num, name, description, category, lat, lng, image_url, active, sort_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    Number(data.num) || 0,
    data.name || '',
    data.description || '',
    data.category || 'infra',
    Number(data.lat) || 0,
    Number(data.lng) || 0,
    data.image_url || '',
    data.active !== false ? 1 : 0,
    Number(data.sort_order) || 0,
    new Date().toISOString(),
  ]);
  return getMapPoint(db, r.lastID);
}

async function updateMapPoint(db, id, data) {
  const fields = [];
  const params = [];
  const allowed = {
    num: Number, name: String, description: String, category: String,
    lat: Number, lng: Number, image_url: String,
    active: v => (v ? 1 : 0), sort_order: Number,
  };
  for (const [key, cast] of Object.entries(allowed)) {
    if (data[key] !== undefined) { fields.push(`${key} = ?`); params.push(cast(data[key])); }
  }
  if (!fields.length) return getMapPoint(db, id);
  params.push(id);
  await run(db, `UPDATE map_points SET ${fields.join(', ')} WHERE id = ?`, params);
  return getMapPoint(db, id);
}

async function deleteMapPoint(db, id) {
  await run(db, 'DELETE FROM map_points WHERE id = ?', [id]);
}

module.exports = {
  DEFAULT_MAP_POINTS, ensureMapPoints,
  listMapPoints, getMapPoint, createMapPoint, updateMapPoint, deleteMapPoint,
};
