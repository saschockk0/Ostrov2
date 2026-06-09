// Минимальный клиент ЮKassa поверх нативного fetch (без новых зависимостей).
// Документация: https://yookassa.ru/developers/api
const crypto = require("crypto");

const API_BASE = "https://api.yookassa.ru/v3";

// Официальные сети, с которых ЮKassa шлёт уведомления (webhooks).
// https://yookassa.ru/developers/using-api/webhooks#ip
const WEBHOOK_NETWORKS = [
  "185.71.76.0/27",
  "185.71.77.0/27",
  "77.75.153.0/25",
  "77.75.156.11/32",
  "77.75.156.35/32",
  "77.75.154.128/25",
  "2a02:5180::/32",
];

function isConfigured() {
  return Boolean(process.env.YOOKASSA_SHOP_ID && process.env.YOOKASSA_SECRET_KEY);
}

function authHeader() {
  const raw = `${process.env.YOOKASSA_SHOP_ID}:${process.env.YOOKASSA_SECRET_KEY}`;
  return "Basic " + Buffer.from(raw).toString("base64");
}

// Копейки → строка "1234.00" для поля amount.value.
function kopecksToValue(kopecks) {
  return (Math.round(Number(kopecks) || 0) / 100).toFixed(2);
}

async function apiCall(method, pathname, body, idempotenceKey) {
  if (!isConfigured()) throw new Error("YOOKASSA_NOT_CONFIGURED");
  const headers = {
    Authorization: authHeader(),
    "Content-Type": "application/json",
  };
  if (method !== "GET") headers["Idempotence-Key"] = idempotenceKey || crypto.randomUUID();

  const res = await fetch(API_BASE + pathname, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = `${data.code || ""} ${data.description || ""}`.trim() || `HTTP ${res.status}`;
    const err = new Error(`YooKassa: ${msg}`);
    err.response = data;
    throw err;
  }
  return data;
}

// Чек по 54-ФЗ. Нужен контакт покупателя (email или телефон), иначе чек не строим.
function buildReceipt({ email, phone, description, amountKopecks }) {
  const customer = {};
  if (email) customer.email = email;
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits) customer.phone = digits;
  if (!customer.email && !customer.phone) return undefined;

  const vatCode = Number(process.env.YOOKASSA_VAT_CODE || 1); // 1 — без НДС
  return {
    customer,
    items: [
      {
        description: (description || "Предоплата за бронирование").slice(0, 128),
        quantity: "1.00",
        amount: { value: kopecksToValue(amountKopecks), currency: "RUB" },
        vat_code: vatCode,
        payment_mode: "full_prepayment",
        payment_subject: "service",
      },
    ],
  };
}

// Создаёт платёж со сценарием СБП и авто-капчуром. Возвращает объект платежа ЮKassa.
async function createPayment({
  amountKopecks,
  description,
  returnUrl,
  email,
  phone,
  metadata,
  withReceipt = true,
}) {
  const body = {
    amount: { value: kopecksToValue(amountKopecks), currency: "RUB" },
    capture: true,
    confirmation: { type: "redirect", return_url: returnUrl },
    description: (description || "").slice(0, 128),
    metadata: metadata || {},
    payment_method_data: { type: "sbp" },
  };
  if (withReceipt) {
    const receipt = buildReceipt({ email, phone, description, amountKopecks });
    if (receipt) body.receipt = receipt;
  }
  return apiCall("POST", "/payments", body);
}

async function getPayment(paymentId) {
  return apiCall("GET", `/payments/${encodeURIComponent(paymentId)}`);
}

async function createRefund({ paymentId, amountKopecks }) {
  return apiCall("POST", "/refunds", {
    payment_id: paymentId,
    amount: { value: kopecksToValue(amountKopecks), currency: "RUB" },
  });
}

// ── Проверка IP вебхука ─────────────────────────────────────────────────────

function parseIp(ip) {
  ip = String(ip || "").trim();
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) ip = mapped[1];

  if (ip.includes(".")) {
    const octs = ip.split(".").map(Number);
    if (octs.length !== 4 || octs.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) return null;
    let n = 0n;
    for (const o of octs) n = (n << 8n) | BigInt(o);
    return { n, family: 4 };
  }
  if (ip.includes(":")) {
    const dbl = ip.split("::");
    if (dbl.length > 2) return null;
    const head = dbl[0] ? dbl[0].split(":") : [];
    const tail = dbl[1] ? dbl[1].split(":") : [];
    const fill = 8 - head.length - tail.length;
    if (fill < 0) return null;
    const groups = [...head, ...Array(fill).fill("0"), ...tail];
    if (groups.length !== 8) return null;
    let n = 0n;
    for (const g of groups) {
      const v = parseInt(g || "0", 16);
      if (Number.isNaN(v) || v < 0 || v > 0xffff) return null;
      n = (n << 16n) | BigInt(v);
    }
    return { n, family: 6 };
  }
  return null;
}

function ipInCidr(ip, cidr) {
  const [net, bitsStr] = cidr.split("/");
  const bits = Number(bitsStr);
  const a = parseIp(ip);
  const b = parseIp(net);
  if (!a || !b || a.family !== b.family) return false;
  const total = a.family === 4 ? 32 : 128;
  const shift = BigInt(total - bits);
  return a.n >> shift === b.n >> shift;
}

function isTrustedWebhookIp(ip) {
  return WEBHOOK_NETWORKS.some((cidr) => ipInCidr(ip, cidr));
}

module.exports = {
  isConfigured,
  createPayment,
  getPayment,
  createRefund,
  isTrustedWebhookIp,
  kopecksToValue,
};
