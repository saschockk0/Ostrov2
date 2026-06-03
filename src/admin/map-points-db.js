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
  { num: 1,  name: 'Причал',              category: 'nav',     lat: 56.69282, lng: 36.38467 },
  { num: 2,  name: 'Штаб',                category: 'infra',   lat: 56.69276, lng: 36.38486 },
  { num: 3,  name: 'BOSS',                category: 'infra',   lat: 56.69260, lng: 36.38468 },
  { num: 4,  name: 'Шатёр',               category: 'camp',    lat: 56.69234, lng: 36.38518 },
  { num: 5,  name: '2-й выход',           category: 'nav',     lat: 56.69222, lng: 36.38503 },
  { num: 6,  name: 'Шатёр',               category: 'camp',    lat: 56.69247, lng: 36.38526 },
  { num: 7,  name: 'Шатёр',               category: 'camp',    lat: 56.69264, lng: 36.38537 },
  { num: 8,  name: 'Спасательные жилеты', category: 'safety',  lat: 56.69292, lng: 36.38522 },
  { num: 9,  name: 'Баня',                category: 'leisure', lat: 56.69304, lng: 36.38542 },
  { num: 10, name: 'Склад',               category: 'infra',   lat: 56.69288, lng: 36.38545 },
  { num: 11, name: 'Склад',               category: 'infra',   lat: 56.69290, lng: 36.38561 },
  { num: 12, name: 'Кухня',               category: 'food',    lat: 56.69285, lng: 36.38586 },
  { num: 13, name: 'Вода',                category: 'infra',   lat: 56.69257, lng: 36.38576 },
  { num: 14, name: 'Эверест',             category: 'leisure', lat: 56.69251, lng: 36.38599 },
  { num: 15, name: 'Шатёр',               category: 'camp',    lat: 56.69245, lng: 36.38539 },
  { num: 16, name: 'Туалет',              category: 'infra',   lat: 56.69241, lng: 36.38698 },
  { num: 17, name: 'Туалет',              category: 'infra',   lat: 56.69242, lng: 36.38689 },
  { num: 18, name: 'Туалет',              category: 'infra',   lat: 56.69221, lng: 36.38683 },
  { num: 19, name: 'Туалет',              category: 'infra',   lat: 56.69221, lng: 36.38694 },
  { num: 20, name: 'Туалет',              category: 'infra',   lat: 56.69224, lng: 36.38725 },
  { num: 21, name: 'Палатка',             category: 'camp',    lat: 56.69207, lng: 36.38769 },
  { num: 22, name: 'Палатка Саши-Лёши',   category: 'camp',    lat: 56.69211, lng: 36.38802 },
  { num: 23, name: 'Шатёр',               category: 'camp',    lat: 56.69176, lng: 36.38823 },
  { num: 24, name: 'Шатёр',               category: 'camp',    lat: 56.69141, lng: 36.38934 },
  { num: 25, name: 'Стоп-знак',           category: 'nav',     lat: 56.69163, lng: 36.39019 },
  { num: 26, name: 'Причал Новомелково',  category: 'transfer', lat: 56.68542, lng: 36.38181,
    description: 'Точка сбора и парковка на материке. Отсюда трансфер на остров — 15 минут по воде, в выходные для гостей бесплатно.' },
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
