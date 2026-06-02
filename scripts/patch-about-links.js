/**
 * One-time migration: add Yandex Maps & Rasp links to about_text in DB.
 * Run: node scripts/patch-about-links.js
 */
require('dotenv').config();
const { initDb } = require('../src/database');
const { getAllContent, setContent } = require('../src/admin/content-db');

const NEW_ABOUT_TEXT = 'Наша основная задача — популяризация парусного спорта и активного отдыха. Парусный клуб «Остров» работает с 2006 года на настоящем острове в акватории Видогощинского залива Иваньковского водохранилища — Тверская область, 133 км от Москвы. «А это правда остров?» — спрашивают нас чаще всего. Да! Очень большой (46 км в длину) и живописный. К нам можно приехать абсолютно неподготовленным, сразу с работы или учёбы — выдаём в аренду всё для отдыха на природе, от надувной подушки до парусного катамарана. На автомобиле: <a href="https://yandex.ru/maps/-/CPTOaN3Q" target="_blank" rel="noopener">причал «Новомелково»</a>. <a href="https://rasp.yandex.ru/search/?fromId=c213&toId=s9601666&transportTypes=suburban" target="_blank" rel="noopener">Электричка</a>: Ленинградский вокзал → Редкино, далее такси 15 мин.';

async function main() {
  const db = initDb();
  try {
    const content = await getAllContent(db);
    console.log('Current about_text (first 120 chars):');
    console.log((content.about_text || '').slice(0, 120));
    await setContent(db, 'about_text', NEW_ABOUT_TEXT);
    console.log('\nDone: about_text updated with map and train links.');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

main();
