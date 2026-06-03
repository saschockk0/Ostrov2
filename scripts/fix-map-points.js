/**
 * Миграция координат плана острова на проде.
 *
 * Зачем: на сервере в таблице map_points уже лежат старые (растянутые) точки,
 * поэтому авто-сид их не перезаписывает. Этот скрипт:
 *   1) обновляет lat/lng у точек 1–25 по полю num (имена/описания/фото не трогает);
 *   2) добавляет причал «Новомелково» (num 26, категория transfer), если его ещё нет.
 *
 * Идемпотентен — можно гонять повторно без вреда.
 * Запуск на сервере: node scripts/fix-map-points.js
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

// Выверенные координаты (геопривязка по POI «Остров» + масштабу снимка).
const COORDS = [
  { num: 1,  lat: 56.69282, lng: 36.38467 },
  { num: 2,  lat: 56.69276, lng: 36.38486 },
  { num: 3,  lat: 56.69260, lng: 36.38468 },
  { num: 4,  lat: 56.69234, lng: 36.38518 },
  { num: 5,  lat: 56.69222, lng: 36.38503 },
  { num: 6,  lat: 56.69247, lng: 36.38526 },
  { num: 7,  lat: 56.69264, lng: 36.38537 },
  { num: 8,  lat: 56.69292, lng: 36.38522 },
  { num: 9,  lat: 56.69304, lng: 36.38542 },
  { num: 10, lat: 56.69288, lng: 36.38545 },
  { num: 11, lat: 56.69290, lng: 36.38561 },
  { num: 12, lat: 56.69285, lng: 36.38586 },
  { num: 13, lat: 56.69257, lng: 36.38576 },
  { num: 14, lat: 56.69251, lng: 36.38599 },
  { num: 15, lat: 56.69245, lng: 36.38539 },
  { num: 16, lat: 56.69241, lng: 36.38698 },
  { num: 17, lat: 56.69242, lng: 36.38689 },
  { num: 18, lat: 56.69221, lng: 36.38683 },
  { num: 19, lat: 56.69221, lng: 36.38694 },
  { num: 20, lat: 56.69224, lng: 36.38725 },
  { num: 21, lat: 56.69207, lng: 36.38769 },
  { num: 22, lat: 56.69211, lng: 36.38802 },
  { num: 23, lat: 56.69176, lng: 36.38823 },
  { num: 24, lat: 56.69141, lng: 36.38934 },
  { num: 25, lat: 56.69163, lng: 36.39019 },
];

// Причал на материке — добавляется отдельной точкой, если её нет.
const PRICHAL = {
  num: 26,
  name: 'Причал Новомелково',
  category: 'transfer',
  lat: 56.68542,
  lng: 36.38181,
  description:
    'Точка сбора и парковка на материке. Отсюда трансфер на остров — 15 минут по воде, в выходные для гостей бесплатно.',
};

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'ostrov',
    charset: 'utf8mb4',
  });

  const [cntRows] = await conn.query('SELECT COUNT(*) AS c FROM map_points');
  console.log(`Точек в map_points сейчас: ${cntRows[0].c}`);

  // 1) Обновляем координаты существующих точек по num.
  let updated = 0;
  for (const p of COORDS) {
    const [res] = await conn.query(
      'UPDATE map_points SET lat = ?, lng = ? WHERE num = ?',
      [p.lat, p.lng, p.num]
    );
    if (res.affectedRows > 0) updated += 1;
    else console.log(`  ! точка num=${p.num} не найдена — пропущена`);
  }
  console.log(`Обновлено координат: ${updated} из ${COORDS.length}`);

  // 2) Причал Новомелково — добавляем, если ещё нет (по num=26).
  const [exists] = await conn.query(
    'SELECT id FROM map_points WHERE num = ? LIMIT 1',
    [PRICHAL.num]
  );
  if (exists.length) {
    await conn.query(
      'UPDATE map_points SET lat = ?, lng = ?, category = ? WHERE num = ?',
      [PRICHAL.lat, PRICHAL.lng, PRICHAL.category, PRICHAL.num]
    );
    console.log('Причал Новомелково уже есть — обновил координаты/категорию.');
  } else {
    await conn.query(
      `INSERT INTO map_points
         (num, name, description, category, lat, lng, image_url, active, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, '', 1, ?, ?)`,
      [
        PRICHAL.num,
        PRICHAL.name,
        PRICHAL.description,
        PRICHAL.category,
        PRICHAL.lat,
        PRICHAL.lng,
        PRICHAL.num,
        new Date().toISOString(),
      ]
    );
    console.log('Причал Новомелково добавлен (num 26, категория transfer).');
  }

  const [rows] = await conn.query(
    'SELECT num, name, category, lat, lng FROM map_points ORDER BY sort_order ASC, num ASC'
  );
  console.log('\nТочки в БД:');
  rows.forEach((r) => console.log(`  #${r.num} ${r.name} [${r.category}] ${r.lat}, ${r.lng}`));

  await conn.end();
  console.log('\nГотово.');
}

main().catch((e) => {
  console.error('Ошибка:', e.message);
  process.exit(1);
});
