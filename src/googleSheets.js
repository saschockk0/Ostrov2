const APPS_SCRIPT_URL = process.env.GOOGLE_APPS_SCRIPT_URL || "";

async function sendToGoogleSheets(application, quote) {
  if (!APPS_SCRIPT_URL) return;

  const answers = application.answers || {};
  const perDay = answers.perDay || {};
  const fixed = answers.fixed || {};

  const accommodation = [
    perDay.tent1 > 0 && `1-мест палатка x${perDay.tent1}`,
    perDay.tent2 > 0 && `2-мест палатка x${perDay.tent2}`,
    perDay.tent3 > 0 && `3-мест палатка x${perDay.tent3}`,
    perDay.sleepingSet > 0 && `Спальный комплект x${perDay.sleepingSet}`,
  ].filter(Boolean).join(", ") || "—";

  const extras = [
    perDay.transfer > 0 && `Трансфер x${perDay.transfer}`,
    perDay.stove > 0 && "Плитка",
    perDay.gasCanister > 0 && `Газ x${perDay.gasCanister}`,
    perDay.tableSet > 0 && `Стол+стулья x${perDay.tableSet}`,
    (perDay.canopyEverest || perDay.canopyLarge || perDay.canopyMedium || perDay.canopySmall) && "Тент",
    fixed.supHour > 0 && `SUP x${fixed.supHour}ч`,
    fixed.kayakHour > 0 && `Каяк x${fixed.kayakHour}ч`,
    fixed.regattaCrew > 0 && `Регата x${fixed.regattaCrew}`,
    answers.storeTripPeople > 0 && `Магазин (${answers.storeTripPeople} чел.)`,
  ].filter(Boolean).join(", ");

  const body = {
    clientType: application.clientType || "individual",
    name: application.name,
    phone: (application.phone || "").replace(/^\+/, ""),
    messenger: application.messenger || "",
    email: application.email || "",
    comment: application.comment || "",
    arrivalDate: answers.arrivalDate || "",
    departureDate: answers.departureDate || "",
    adults: answers.adults != null ? String(answers.adults) : "",
    children: answers.children != null ? String(answers.children) : "",
    nights: quote.nights != null ? String(quote.nights) : "",
    accommodation,
    extras: extras || "—",
    total: quote.total != null ? String(quote.total) : "",
    breakdown: (quote.breakdown || [])
      .map((r) => `${r.label}: ${r.amount}₽`)
      .join("\n"),
  };

  const res = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(`Google Apps Script responded ${res.status}`);
  }
}

module.exports = { sendToGoogleSheets };
