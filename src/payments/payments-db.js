// CRUD-хелперы для таблицы payments. Стиль повторяет src/admin/db.js.

function query(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      err ? reject(err) : resolve(this);
    });
  });
}

function getOne(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

async function insertPayment(db, p) {
  const result = await run(
    db,
    `INSERT INTO payments
      (application_id, yookassa_id, amount_kopecks, currency, status, description, confirmation_url, source, created_at, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      p.applicationId,
      p.yookassaId || null,
      p.amountKopecks,
      p.currency || "RUB",
      p.status || "pending",
      (p.description || "").slice(0, 255),
      p.confirmationUrl || null,
      p.source || "auto",
      new Date().toISOString(),
      JSON.stringify(p.metadata || {}),
    ]
  );
  return result.lastID;
}

const UPDATABLE = new Set([
  "yookassa_id",
  "status",
  "confirmation_url",
  "paid_at",
  "refunded_at",
  "raw_event_json",
  "amount_kopecks",
]);

async function updatePayment(db, id, fields) {
  const cols = [];
  const params = [];
  for (const [key, value] of Object.entries(fields)) {
    if (!UPDATABLE.has(key) || value === undefined) continue;
    cols.push(`${key} = ?`);
    params.push(value);
  }
  if (!cols.length) return;
  params.push(id);
  await run(db, `UPDATE payments SET ${cols.join(", ")} WHERE id = ?`, params);
}

async function getPaymentById(db, id) {
  return getOne(db, "SELECT * FROM payments WHERE id = ?", [id]);
}

async function getPaymentByYookassaId(db, ykId) {
  if (!ykId) return null;
  return getOne(db, "SELECT * FROM payments WHERE yookassa_id = ? LIMIT 1", [ykId]);
}

async function listPaymentsForApplication(db, appId) {
  return query(db, "SELECT * FROM payments WHERE application_id = ? ORDER BY id DESC", [appId]);
}

// Пересчитывает сумму успешных платежей по заявке и пишет её в applications.
async function recalcPaidAmount(db, appId) {
  const row = await getOne(
    db,
    "SELECT COALESCE(SUM(amount_kopecks), 0) AS paid FROM payments WHERE application_id = ? AND status = 'succeeded'",
    [appId]
  );
  const paid = Number(row?.paid || 0);
  await run(db, "UPDATE applications SET paid_amount_kopecks = ? WHERE id = ?", [paid, appId]);
  return paid;
}

module.exports = {
  insertPayment,
  updatePayment,
  getPaymentById,
  getPaymentByYookassaId,
  listPaymentsForApplication,
  recalcPaidAmount,
};
