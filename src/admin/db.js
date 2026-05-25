function query(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  });
}

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

function tryParse(str) {
  try { return JSON.parse(str); } catch { return null; }
}

function parseApp(row) {
  return {
    ...row,
    answers: tryParse(row.answers_json) || {},
    quote: tryParse(row.quote_json) || {},
    manager_note: row.manager_note || '',
  };
}

async function listApplications(db, { status, search, limit = 50, offset = 0 } = {}) {
  const conditions = [];
  const params = [];
  if (status && status !== 'all') { conditions.push('status = ?'); params.push(status); }
  if (search) {
    conditions.push('(name LIKE ? OR phone LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await query(
    db,
    `SELECT * FROM applications ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, Math.min(limit, 500), offset]
  );
  return rows.map(parseApp);
}

async function getApplication(db, id) {
  const row = await getOne(db, 'SELECT * FROM applications WHERE id = ?', [id]);
  return row ? parseApp(row) : null;
}

async function updateApplication(db, id, updates) {
  const allowed = ['status', 'manager_note'];
  const fields = [];
  const params = [];
  for (const key of allowed) {
    if (updates[key] !== undefined) { fields.push(`${key} = ?`); params.push(updates[key]); }
  }
  if (!fields.length) return;
  params.push(id);
  await run(db, `UPDATE applications SET ${fields.join(', ')} WHERE id = ?`, params);
}

async function insertManualApplication(db, app) {
  const result = await run(db, `
    INSERT INTO applications
      (created_at, client_type, name, phone, messenger, email, comment, answers_json, quote_json, status, manager_note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    new Date().toISOString(),
    app.clientType || 'individual',
    app.name,
    app.phone,
    app.messenger || '',
    app.email || '',
    app.comment || '',
    JSON.stringify(app.answers || {}),
    JSON.stringify(app.quote || { isValid: true, total: 0, nights: 0, breakdown: [] }),
    app.status || 'new',
    app.manager_note || '',
  ]);
  return result.lastID;
}

async function getStats(db) {
  const counts = await query(db, `SELECT status, COUNT(*) as count FROM applications GROUP BY status`);
  const totalRow = await getOne(db, `SELECT COUNT(*) as total FROM applications`);
  const revenueRow = await getOne(db, `
    SELECT SUM(CAST(json_extract(quote_json, '$.total') AS REAL)) as total
    FROM applications WHERE status = 'confirmed'
  `);
  const byStatus = {};
  counts.forEach(r => { byStatus[r.status] = r.count; });
  return {
    total: totalRow?.total || 0,
    new: byStatus.new || 0,
    in_progress: byStatus.in_progress || 0,
    confirmed: byStatus.confirmed || 0,
    rejected: byStatus.rejected || 0,
    confirmedRevenue: Math.round(revenueRow?.total || 0),
  };
}

function csvEscape(val) {
  const str = val === null || val === undefined ? '' : String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

const STATUS_LABELS = {
  new: 'Новая', in_progress: 'В работе', confirmed: 'Подтверждена', rejected: 'Отказ',
};

function generateCsv(apps) {
  const headers = ['ID', 'Дата', 'Имя', 'Телефон', 'Мессенджер', 'Email',
    'Приезд', 'Отъезд', 'Взрослых', 'Детей', 'Ночей', 'Сумма', 'Статус', 'Комментарий', 'Заметка менеджера'];
  const rows = apps.map(a => [
    a.id,
    a.created_at,
    a.name,
    a.phone,
    a.messenger,
    a.email,
    a.answers?.arrivalDate || '',
    a.answers?.departureDate || '',
    a.answers?.adults || '',
    a.answers?.children || '',
    a.quote?.nights || '',
    a.quote?.total || 0,
    STATUS_LABELS[a.status] || a.status,
    a.comment,
    a.manager_note,
  ].map(csvEscape).join(','));
  return [headers.join(','), ...rows].join('\r\n');
}

module.exports = { listApplications, getApplication, updateApplication, insertManualApplication, getStats, generateCsv };
