const WEEKEND_DAYS = new Set([5, 6, 0]); // Fri, Sat, Sun

const SEASONAL_STAY_RATES = {
  maySept: { weekend: 3000, weekday: 1300 },
  june: { weekend: 4100, weekday: 1300 },
  julyAug: { weekend: 4700, weekday: 1300 },
  child: { weekend: 1500, weekday: 700 },
};

const PER_DAY_ITEMS = {
  instructor: { label: "Инструктор на воде", weekend: 2000, weekday: 2000 },
  tent1: { label: "Палатка 1-местная", weekend: 500, weekday: 250 },
  tent2: { label: "Палатка 2-местная", weekend: 700, weekday: 350 },
  tent3: { label: "Палатка 3-местная", weekend: 900, weekday: 450 },
  sleepingSet: { label: "Спальный комплект", weekend: 600, weekday: 300 },
  canopyEverest: { label: 'Кухня-шатер "Эверест"', weekend: 10000, weekday: 4000 },
  canopyLarge: { label: "Кухня большая", weekend: 7800, weekday: 3000 },
  canopyMedium: { label: "Кухня средняя", weekend: 4500, weekday: 1600 },
  canopySmall: { label: "Кухня малая", weekend: 1500, weekday: 600 },
  tableSet: { label: "Стол с табуретками", weekend: 700, weekday: 300 },
  stove: { label: "Походная плитка", weekend: 600, weekday: 250 },
  gasCanister: { label: "Газовый баллончик", weekend: 250, weekday: 250 },
  transfer: { label: "Трансфер на остров и обратно", weekend: 0, weekday: 450 },
};

const FIXED_ITEMS = {
  raftWalkPerPerson: { label: "Прогулка на плоту (с чел.)", price: 500 },
  raftRentHour: { label: "Аренда плота (час)", price: 6000 },
  boatAroundIsland: { label: "На катере вокруг острова", price: 4000 },
  boatChurchRoundtrip: { label: "На катере к церкви и обратно", price: 4500 },
  regattaCrew: { label: "Регата (с экипажа)", price: 1000 },
  supHour: { label: "SUP (час)", price: 600 },
  kayakHour: { label: "Байдарка (час)", price: 600 },
  tshirt: { label: "Футболка", price: 1500 },
};

function dateRangeDays(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return [];
  }

  const days = [];
  const cursor = new Date(start);
  while (cursor < end) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function getStayRateForDate(date, isChild = false) {
  const weekend = WEEKEND_DAYS.has(date.getDay());
  if (isChild) {
    return weekend ? SEASONAL_STAY_RATES.child.weekend : SEASONAL_STAY_RATES.child.weekday;
  }

  const month = date.getMonth() + 1;
  if (month === 6) {
    return weekend ? SEASONAL_STAY_RATES.june.weekend : SEASONAL_STAY_RATES.june.weekday;
  }
  if (month === 7 || month === 8) {
    return weekend ? SEASONAL_STAY_RATES.julyAug.weekend : SEASONAL_STAY_RATES.julyAug.weekday;
  }
  return weekend ? SEASONAL_STAY_RATES.maySept.weekend : SEASONAL_STAY_RATES.maySept.weekday;
}

function perDayItemRate(itemKey, date) {
  const item = PER_DAY_ITEMS[itemKey];
  if (!item) return 0;
  return WEEKEND_DAYS.has(date.getDay()) ? item.weekend : item.weekday;
}

function toQty(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

function calculateQuote(payload) {
  const adults = toQty(payload.adults);
  const children = toQty(payload.children);
  const totalGuests = adults + children;
  const days = dateRangeDays(payload.arrivalDate, payload.departureDate);

  if (!days.length || totalGuests < 1) {
    return {
      isValid: false,
      total: 0,
      nights: 0,
      breakdown: [{ label: "Некорректные даты или количество гостей", amount: 0 }],
    };
  }

  const breakdown = [];
  let total = 0;

  let adultsStay = 0;
  let childrenStay = 0;
  for (const day of days) {
    adultsStay += getStayRateForDate(day, false) * adults;
    childrenStay += getStayRateForDate(day, true) * children;
  }
  total += adultsStay + childrenStay;
  if (adultsStay > 0) breakdown.push({ label: "Проживание взрослых", amount: adultsStay });
  if (childrenStay > 0) breakdown.push({ label: "Проживание детей 7-14", amount: childrenStay });

  const perDayQuantities = payload.perDay || {};
  for (const [itemKey, item] of Object.entries(PER_DAY_ITEMS)) {
    const qty = toQty(perDayQuantities[itemKey]);
    if (!qty) continue;
    let amount = 0;
    for (const day of days) amount += perDayItemRate(itemKey, day) * qty;
    total += amount;
    breakdown.push({ label: `${item.label} x${qty}`, amount });
  }

  const fixedQuantities = payload.fixed || {};
  for (const [itemKey, item] of Object.entries(FIXED_ITEMS)) {
    const qty = toQty(fixedQuantities[itemKey]);
    if (!qty) continue;
    const amount = item.price * qty;
    total += amount;
    breakdown.push({ label: `${item.label} x${qty}`, amount });
  }

  const storeTripPeople = toQty(payload.storeTripPeople);
  if (storeTripPeople > 0) {
    const amount = Math.max(300 * storeTripPeople, 600);
    total += amount;
    breakdown.push({ label: `Поездка в магазин (${storeTripPeople} чел.)`, amount });
  }

  return {
    isValid: true,
    total,
    nights: days.length,
    guests: totalGuests,
    breakdown,
    disclaimer: "Предварительная стоимость. Финальную сумму подтверждает менеджер.",
  };
}

module.exports = {
  WEEKEND_DAYS,
  PER_DAY_ITEMS,
  FIXED_ITEMS,
  SEASONAL_STAY_RATES,
  calculateQuote,
};
