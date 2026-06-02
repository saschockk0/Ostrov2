/**
 * Seed script: inserts the original hardcoded fleet data into the DB.
 * Run once on the server: node scripts/seed-fleet.js
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

const fleet = [
  {
    name: '«Ветер»',
    kind: 'Парусный катамаран',
    image_url: '/images/fleet/veter.jpg',
    count: '×10',
    length_m: '5,0 м',
    sail_area: '10 м²',
    crew: '2–4 чел.',
    note: 'Конструкция, проверенная временем. Опытному рулевому позволит удовлетворить спортивные амбиции и в то же время «простит» ошибки новичку.',
    sort_order: 1,
  },
  {
    name: '«Бриз-Микро»',
    kind: 'Парусный катамаран',
    image_url: '/images/fleet/breese.jpg',
    count: '×2',
    length_m: '4,0 м',
    sail_area: '5 м²',
    crew: '1–2 чел.',
    note: 'Если вы только обучаетесь парусному делу — это для вас. Благодаря низкому креплению вант даже сильный порыв ветра не перевернёт катамаран. Отличный вариант на выходной.',
    sort_order: 2,
  },
  {
    name: '«Витамин»',
    kind: 'Парусный катамаран',
    image_url: '/images/fleet/vitamin.jpg',
    count: '',
    length_m: '—',
    sail_area: '—',
    crew: '1–2 чел.',
    note: 'Пляжный прогулочный катамаран из мастерской Сергея Новицкого. Управлять им проще, чем доской или яхтой, — уверенно пойдёте уже в первый день.',
    sort_order: 3,
  },
  {
    name: 'Плот «Дункель»',
    kind: 'Моторный · трансфер',
    image_url: '',
    count: '×1',
    length_m: '8,4 м',
    sail_area: '15 л.с.',
    crew: 'до 12 чел.',
    note: 'Прогулки вокруг острова в штиль. Не в аренду',
    sort_order: 4,
  },
];

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'ostrov',
    charset: 'utf8mb4',
  });

  // Check if fleet already has data
  const [existing] = await conn.query('SELECT COUNT(*) as cnt FROM fleet');
  if (existing[0].cnt > 0) {
    console.log(`Fleet already has ${existing[0].cnt} items. Skipping seed.`);
    await conn.end();
    return;
  }

  const now = new Date().toISOString();
  for (const item of fleet) {
    await conn.query(
      `INSERT INTO fleet (name, kind, image_url, count, length_m, sail_area, crew, note, active, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [item.name, item.kind, item.image_url, item.count, item.length_m, item.sail_area, item.crew, item.note, item.sort_order, now]
    );
    console.log('Inserted:', item.name);
  }

  const [rows] = await conn.query('SELECT id, name, kind, count FROM fleet ORDER BY sort_order');
  console.log('\nFleet in DB:');
  rows.forEach(r => console.log(`  #${r.id} ${r.name} (${r.kind}) ${r.count || ''}`));

  await conn.end();
  console.log('\nDone!');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
