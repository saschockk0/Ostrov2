require('dotenv').config();

const { initSchema } = require('../src/database');
const { loadPricesFromDb } = require('../src/pricing');
const app = require('../src/server');

let initPromise = null;

function ensureInit() {
  if (!initPromise) {
    initPromise = initSchema().then(loadPricesFromDb);
  }
  return initPromise;
}

module.exports = async (req, res) => {
  await ensureInit();
  return app(req, res);
};
