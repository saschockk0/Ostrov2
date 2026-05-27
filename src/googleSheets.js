const APPS_SCRIPT_URL = process.env.GOOGLE_APPS_SCRIPT_URL || "";

async function sendToGoogleSheets(application, quote) {
  if (!APPS_SCRIPT_URL) return;

  const answers = application.answers || {};
  const body = {
    clientType: application.clientType || "individual",
    name: application.name,
    phone: application.phone,
    messenger: application.messenger || "",
    email: application.email || "",
    comment: application.comment || "",
    activity: answers.activity || "",
    startDate: answers.startDate || "",
    endDate: answers.endDate || "",
    adults: answers.adults != null ? String(answers.adults) : "",
    children: answers.children != null ? String(answers.children) : "",
    accommodation: answers.accommodation || "",
    food: answers.food || "",
    total: quote.total != null ? String(quote.total) : "",
    breakdown: quote.breakdown ? JSON.stringify(quote.breakdown) : "",
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
