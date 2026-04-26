require("dotenv").config();

const path = require("path");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const { calculateQuote, PER_DAY_ITEMS, FIXED_ITEMS } = require("./pricing");
const { initDb, insertApplication } = require("./database");
const { sendApplicationEmail } = require("./email");

const app = express();
const db = initDb();
const port = Number(process.env.PORT || 3000);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "512kb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

app.use(
  "/api",
  rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

const submitLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Слишком много попыток. Попробуйте позже." },
});

app.get("/api/config", (req, res) => {
  res.json({
    turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || "",
    perDayItems: PER_DAY_ITEMS,
    fixedItems: FIXED_ITEMS,
  });
});

app.post("/api/quote", (req, res) => {
  const quote = calculateQuote(req.body || {});
  if (!quote.isValid) {
    return res.status(400).json({ error: "Проверьте даты и количество гостей." });
  }
  return res.json(quote);
});

async function verifyTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: true, skipped: true };

  if (!token) return { ok: false, reason: "MISSING_TOKEN" };

  const params = new URLSearchParams();
  params.append("secret", secret);
  params.append("response", token);
  if (ip) params.append("remoteip", ip);

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: params,
  });
  const data = await response.json();
  return { ok: Boolean(data.success), reason: data["error-codes"] || null };
}

app.post("/api/applications", submitLimiter, async (req, res) => {
  try {
    const payload = req.body || {};

    if (payload.website) {
      return res.status(400).json({ error: "Подозрительный запрос." });
    }

    if (!payload.name || !payload.phone) {
      return res.status(400).json({ error: "Введите имя и телефон." });
    }

    const quote = calculateQuote(payload.answers || {});
    if (!quote.isValid) {
      return res.status(400).json({ error: "Не удалось рассчитать стоимость." });
    }

    const verify = await verifyTurnstile(payload.turnstileToken, req.ip);
    if (!verify.ok) {
      return res.status(400).json({ error: "Проверка безопасности не пройдена." });
    }

    const appId = await insertApplication(db, {
      clientType: payload.clientType,
      name: payload.name,
      phone: payload.phone,
      messenger: payload.messenger,
      email: payload.email,
      comment: payload.comment,
      answers: payload.answers,
      quote,
    });

    const emailStatus = await sendApplicationEmail(appId, payload, quote);

    // TODO: add Telegram bot delivery in next iteration.
    return res.status(201).json({
      ok: true,
      applicationId: appId,
      quote,
      emailSent: emailStatus.sent,
    });
  } catch (error) {
    console.error("Application submit error:", error);
    return res.status(500).json({ error: "Ошибка сервера. Попробуйте позже." });
  }
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.listen(port, () => {
  console.log(`Ostrov app running on http://localhost:${port}`);
});
