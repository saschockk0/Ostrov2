const nodemailer = require("nodemailer");

function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secure = process.env.SMTP_SECURE === "true";

  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    family: 4,
  });
}

function money(value) {
  return Number(value || 0).toLocaleString("ru-RU");
}

function buildMailText(appId, payload, quote) {
  const lines = [];
  lines.push(`Новая заявка #${appId}`);
  lines.push(`Дата: ${new Date().toLocaleString("ru-RU")}`);
  lines.push("");
  lines.push("Контакты:");
  lines.push(`- Тип клиента: ${payload.clientType === "business" ? "Юрлицо" : "Физлицо"}`);
  lines.push(`- Имя: ${payload.name}`);
  lines.push(`- Телефон: ${payload.phone}`);
  if (payload.messenger) lines.push(`- Мессенджер: ${payload.messenger}`);
  if (payload.email) lines.push(`- Email: ${payload.email}`);
  if (payload.comment) lines.push(`- Комментарий: ${payload.comment}`);
  lines.push("");
  lines.push("Параметры отдыха:");
  lines.push(`- Взрослые: ${payload.answers?.adults || 0}`);
  lines.push(`- Дети 7-14: ${payload.answers?.children || 0}`);
  lines.push(`- Заезд: ${payload.answers?.arrivalDate || "-"}`);
  lines.push(`- Выезд: ${payload.answers?.departureDate || "-"}`);
  lines.push("");
  if (quote && quote.isValid) {
    lines.push("Расчет:");
    for (const row of quote.breakdown || []) {
      lines.push(`- ${row.label}: ${money(row.amount)} ₽`);
    }
    lines.push(`Итого: ${money(quote.total)} ₽`);
    lines.push("");
    lines.push("Финальную стоимость подтверждает менеджер.");
  } else {
    lines.push("Расчет: контактная заявка — клиент не считал стоимость.");
    lines.push("Свяжитесь с клиентом и подберите вариант.");
  }
  return lines.join("\n");
}

async function sendApplicationEmail(appId, payload, quote) {
  const transporter = createTransporter();
  const to = process.env.MANAGER_EMAIL;
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  if (!transporter || !to || !from) {
    return { sent: false, reason: "SMTP_NOT_CONFIGURED" };
  }

  const subject = `Заявка #${appId} — Парусный Клуб Остров`;
  const text = buildMailText(appId, payload, quote);

  await transporter.sendMail({
    from,
    to,
    subject,
    text,
  });

  return { sent: true };
}

module.exports = {
  sendApplicationEmail,
};
