// Доставка заявок в сообщения сообщества ВКонтакте (серверы в РФ — без
// трансграничной передачи ПДн, в отличие от Google Sheets / Telegram).
//
// Настройка (.env):
//   VK_GROUP_TOKEN   — ключ доступа сообщества с правом «Сообщения»
//                      (Управление → Работа с API → Ключи доступа).
//   VK_MANAGER_PEER  — кому слать. Это peer_id получателя:
//                      • личка менеджера — его user_id (например 12345678).
//                        Менеджер должен один раз написать сообществу,
//                        чтобы открылся диалог.
//                      • беседа сообщества — 2000000000 + chat_id.
//                      Можно перечислить нескольких через запятую.
//
// Если переменные не заданы — модуль молча ничего не делает (как googleSheets).

const { buildMailText } = require("./email");

const VK_API = "https://api.vk.com/method/messages.send";
const VK_API_VERSION = "5.199";

async function sendToVk(appId, payload, quote) {
  const token = process.env.VK_GROUP_TOKEN;
  const peersRaw = process.env.VK_MANAGER_PEER;
  if (!token || !peersRaw) return { sent: false, reason: "VK_NOT_CONFIGURED" };

  const peers = peersRaw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (!peers.length) return { sent: false, reason: "VK_NO_PEERS" };

  const message = buildMailText(appId, payload, quote);

  const results = [];
  for (const peer of peers) {
    const params = new URLSearchParams({
      access_token: token,
      v: VK_API_VERSION,
      peer_id: peer,
      random_id: String(Math.floor(Math.random() * 2_000_000_000)),
      message,
      dont_parse_links: "1",
    });

    const res = await fetch(VK_API, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    // VK отвечает 200 даже на логические ошибки — реальная ошибка лежит в data.error.
    const data = await res.json().catch(() => ({}));
    if (data.error) {
      throw new Error(
        `VK API error ${data.error.error_code}: ${data.error.error_msg} (peer ${peer})`
      );
    }
    results.push(peer);
  }

  return { sent: true, peers: results };
}

module.exports = { sendToVk };
