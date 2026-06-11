/**
 * One-time migration: sync about_text (geo-keywords) and add faq_9..faq_11
 * to the live content DB so real visitors see the same SEO copy as crawlers.
 * Run: node scripts/patch-seo-content.js
 */
require('dotenv').config();
const { initDb } = require('../src/database');
const { getAllContent, setManyContent, DEFAULT_CONTENT } = require('../src/admin/content-db');

const KEYS = ['about_text', 'faq_9', 'faq_10', 'faq_11'];

async function main() {
  const db = initDb();
  try {
    const before = await getAllContent(db);
    console.log('Before about_text (first 140 chars):');
    console.log((before.about_text || '').slice(0, 140));

    const updates = {};
    for (const k of KEYS) updates[k] = DEFAULT_CONTENT[k];
    await setManyContent(db, updates);

    const after = await getAllContent(db);
    console.log('\nAfter — Московское море:', /Московское море/.test(after.about_text || ''),
      '| Конаковский:', /Конаковский/.test(after.about_text || ''));
    console.log('faq_9/10/11 present:', !!after.faq_9, !!after.faq_10, !!after.faq_11);
    console.log('\nDone.');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

main();
