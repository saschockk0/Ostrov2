// Учёт наличия мест/палаток/шатров.
// Занятость считается из заявок (по умолчанию только confirmed) + ручных блокировок (date_blocks),
// ёмкость — из таблицы inventory. Свободно = capacity − занято (на каждый день).
const { dateRangeDays, WEEKEND_DAYS, getPrices } = require('./pricing');

const CAMP_KEY = 'campSpots';
const CAMP_LABEL = 'Места в лагере (гостей)';

const MONTHS_RU = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

function query(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

function toQty(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function dayKey(date) {
  // Локальная дата в формате YYYY-MM-DD (даты заявок — без времени, поэтому UTC-сдвиг не важен)
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Метка ресурса: для палаток/шатров — из прайса, чтобы не дублировать названия.
function resourceLabel(key) {
  if (key === CAMP_KEY) return CAMP_LABEL;
  const item = getPrices().perDayItems[key];
  return item ? item.label : key;
}

// Сколько единиц каждого ресурса «съедает» одна заявка (одинаково на каждый её день).
function consumptionForApp(answers) {
  const perDay = answers.perDay || {};
  const out = { [CAMP_KEY]: toQty(answers.adults) + toQty(answers.children) };
  for (const key of ['tent1', 'tent2', 'tent3', 'canopyEverest', 'canopyLarge', 'canopyMedium', 'canopySmall']) {
    out[key] = toQty(perDay[key]);
  }
  return out;
}

function tryParse(str) {
  try { return JSON.parse(str); } catch { return null; }
}

// Группировка дня в «выходные» (пт–вс): ключ — дата пятницы той недели.
function weekendFridayKey(date) {
  const d = new Date(date);
  const dow = d.getDay();
  if (dow === 5) { /* пятница */ }
  else if (dow === 6) d.setDate(d.getDate() - 1); // суббота → пятница
  else if (dow === 0) d.setDate(d.getDate() - 2); // воскресенье → пятница
  else return null; // будни в выходные не группируем
  return dayKey(d);
}

function weekendLabel(fridayKey) {
  const fri = new Date(fridayKey);
  const sun = new Date(fri); sun.setDate(sun.getDate() + 2);
  const sameMonth = fri.getMonth() === sun.getMonth();
  const left = `${fri.getDate()}`;
  const right = `${sun.getDate()} ${MONTHS_RU[sun.getMonth()]}`;
  return sameMonth ? `${left}–${right}` : `${left} ${MONTHS_RU[fri.getMonth()]} – ${right}`;
}

/**
 * Полная матрица занятости/свободы по ресурсам за окно [from, to).
 * @returns { from, to, days, resources:[{key,kind,label,capacity,byDay,peakOccupied,minFree}], weekends:[...] }
 */
async function computeAvailability(db, { from, to, statuses = ['confirmed'] } = {}) {
  const days = dateRangeDays(from, to);
  if (!days.length) return { from, to, days: [], resources: [], weekends: [] };
  const dayKeys = days.map(dayKey);
  const windowSet = new Set(dayKeys);

  // 1. Ёмкости
  const invRows = await query(db, 'SELECT resource_key, kind, capacity, sort_order FROM inventory ORDER BY sort_order ASC, resource_key ASC');
  const resources = invRows.map((r) => ({
    key: r.resource_key,
    kind: r.kind,
    label: resourceLabel(r.resource_key),
    capacity: toQty(r.capacity),
    sort_order: r.sort_order,
    byDay: {},
    peakOccupied: 0,
    minFree: toQty(r.capacity),
  }));
  const byKey = Object.fromEntries(resources.map((r) => [r.key, r]));

  // Занятость и полностью закрытые дни
  const occupied = {}; // key -> { dayKey -> qty }
  for (const r of resources) occupied[r.key] = {};
  const closedDays = new Set();

  const addOccupancy = (key, dk, qty) => {
    if (!byKey[key] || !qty) return;
    occupied[key][dk] = (occupied[key][dk] || 0) + qty;
  };

  // 2. Заявки выбранных статусов
  if (statuses.length) {
    const placeholders = statuses.map(() => '?').join(',');
    const apps = await query(db, `SELECT answers_json FROM applications WHERE status IN (${placeholders})`, statuses);
    for (const app of apps) {
      const answers = tryParse(app.answers_json) || {};
      if (!answers.arrivalDate || !answers.departureDate) continue;
      const appDays = dateRangeDays(answers.arrivalDate, answers.departureDate);
      if (!appDays.length) continue;
      const cons = consumptionForApp(answers);
      for (const d of appDays) {
        const dk = dayKey(d);
        if (!windowSet.has(dk)) continue;
        for (const key of Object.keys(cons)) addOccupancy(key, dk, cons[key]);
      }
    }
  }

  // 3. Ручные блокировки
  const blocks = await query(
    db,
    'SELECT resource_key, start_date, end_date, qty FROM date_blocks WHERE start_date < ? AND end_date > ?',
    [to, from]
  );
  for (const b of blocks) {
    const bDays = dateRangeDays(b.start_date, b.end_date);
    for (const d of bDays) {
      const dk = dayKey(d);
      if (!windowSet.has(dk)) continue;
      if (b.resource_key === 'all') closedDays.add(dk);
      else addOccupancy(b.resource_key, dk, toQty(b.qty));
    }
  }

  // 4. Сводим byDay + пики
  for (const r of resources) {
    for (const dk of dayKeys) {
      const closed = closedDays.has(dk);
      const occ = closed ? r.capacity : (occupied[r.key][dk] || 0);
      const free = Math.max(0, r.capacity - occ);
      r.byDay[dk] = { occupied: occ, free, closed };
      if (occ > r.peakOccupied) r.peakOccupied = occ;
      if (free < r.minFree) r.minFree = free;
    }
  }

  // 5. Группировка по выходным (пт–вс)
  const weekendMap = new Map(); // fridayKey -> Set(dayKey)
  for (const dk of dayKeys) {
    const fk = weekendFridayKey(new Date(dk));
    if (!fk) continue;
    if (!weekendMap.has(fk)) weekendMap.set(fk, new Set());
    weekendMap.get(fk).add(dk);
  }
  const weekends = [...weekendMap.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([fk, set]) => {
      const wDays = [...set];
      const resAgg = {};
      for (const r of resources) {
        let peakOcc = 0;
        let minFree = r.capacity;
        for (const dk of wDays) {
          const cell = r.byDay[dk];
          if (cell.occupied > peakOcc) peakOcc = cell.occupied;
          if (cell.free < minFree) minFree = cell.free;
        }
        resAgg[r.key] = { capacity: r.capacity, occupied: peakOcc, free: minFree };
      }
      const camp = resAgg[CAMP_KEY] || { capacity: 0, occupied: 0, free: 0 };
      const loadPct = camp.capacity ? Math.round((camp.occupied / camp.capacity) * 100) : 0;
      return { fridayKey: fk, label: weekendLabel(fk), days: wDays, resources: resAgg, campFree: camp.free, loadPct };
    });

  return { from, to, days: dayKeys, resources, weekends };
}

/**
 * Проверка одной брони на овербукинг. Возвращает нарушения по дням/ресурсам.
 */
async function checkAvailability(db, booking, statuses = ['confirmed']) {
  const { arrivalDate, departureDate } = booking || {};
  if (!arrivalDate || !departureDate) return { ok: true, violations: [] };
  const requested = consumptionForApp(booking);

  const avail = await computeAvailability(db, { from: arrivalDate, to: departureDate, statuses });
  if (!avail.days.length) return { ok: true, violations: [] };
  const byKey = Object.fromEntries(avail.resources.map((r) => [r.key, r]));

  const violations = [];
  for (const key of Object.keys(requested)) {
    const need = requested[key];
    if (!need) continue;
    const r = byKey[key];
    if (!r) continue;
    for (const dk of avail.days) {
      const cell = r.byDay[dk];
      if (need > cell.free) {
        violations.push({ resource: key, label: r.label, date: dk, requested: need, free: cell.free });
      }
    }
  }
  return { ok: violations.length === 0, violations };
}

// Краткое человекочитаемое сообщение об овербукинге (для 409 на сайте).
function violationMessage(violations) {
  if (!violations || !violations.length) return '';
  const worst = {};
  for (const v of violations) {
    if (!worst[v.resource] || v.free < worst[v.resource].free) worst[v.resource] = v;
  }
  const parts = Object.values(worst).map((v) =>
    v.free <= 0 ? `${v.label} — мест нет` : `${v.label} — свободно только ${v.free}`
  );
  return `На выбранные даты не хватает мест: ${parts.join('; ')}. Выберите другие даты или меньшее количество.`;
}

module.exports = { CAMP_KEY, CAMP_LABEL, computeAvailability, checkAvailability, violationMessage, resourceLabel };
