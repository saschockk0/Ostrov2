// Доставка заявок с сайта в чат менеджеров в Telegram.
//
// Это «задел под Telegram» из CLAUDE.md/instructions.md: канал-уведомление,
// устроенный точно как vk.js — читает env, молча ничего не делает, если не
// настроен, и шлёт тот же текст, что уходит на email (buildMailText).
//
// Важно: это НЕ воронка бота @Ostrave_bot (вечеринка, билеты, статусы). Здесь
// просто sendMessage в чат — заявка с сайта падает рядом с заявками бота, если
// указать тот же чат. Менеджерских кнопок/статусов тут нет.
//
// Настройка (.env):
//   TELEGRAM_BOT_TOKEN   — токен бота от @BotFather. Можно переиспользовать
//                          токен @Ostrave_bot (BOT_TOKEN из проекта бота) или
//                          завести отдельного бота под сайт.
//   TELEGRAM_MANAGER_CHAT — куда слать. chat_id получателя:
//                          • группа менеджеров — отрицательный id
//                            (тот же MANAGERS_CHAT_ID, что у бота);
//                          • личка менеджера — его user_id (менеджер должен
//                            один раз написать боту, иначе Telegram не доставит).
//                          Можно перечислить нескольких через запятую.
//
// Если переменные не заданы — модуль молча ничего не делает (как vk.js).

const { buildMailText } = require("./email");

async function sendToTelegram(appId, payload, quote) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatsRaw = process.env.TELEGRAM_MANAGER_CHAT;
  if (!token || !chatsRaw) return { sent: false, reason: "TELEGRAM_NOT_CONFIGURED" };

  const chats = chatsRaw
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  if (!chats.length) return { sent: false, reason: "TELEGRAM_NO_CHATS" };

  // Шлём как обычный текст (без parse_mode) — заявка содержит имя/комментарий
  // от клиента, не хотим возиться с экранированием Markdown/HTML.
  const text = `🆕 Заявка с сайта\n\n${buildMailText(appId, payload, quote)}`;

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const results = [];
  for (const chat of chats) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chat,
        text,
        disable_web_page_preview: true,
      }),
    });

    // Telegram отвечает 200 даже на логические ошибки — смотрим поле ok.
    const data = await res.json().catch(() => ({}));
    if (!data.ok) {
      throw new Error(
        `Telegram API error ${data.error_code || "?"}: ${data.description || "unknown"} (chat ${chat})`
      );
    }
    results.push(chat);
  }

  return { sent: true, chats: results };
}

module.exports = { sendToTelegram };
