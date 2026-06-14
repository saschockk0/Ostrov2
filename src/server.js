require("dotenv").config();

const path = require("path");
const fs = require("fs");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const { calculateQuote, getPrices } = require("./pricing");
const { initDb, insertApplication } = require("./database");
const { sendToGoogleSheets } = require("./googleSheets");
const { sendApplicationEmail, sendPaymentSucceeded } = require("./email");
const yookassa = require("./payments/yookassa");
const {
  insertPayment, updatePayment, getPaymentByYookassaId,
  listPaymentsForApplication, recalcPaidAmount,
} = require("./payments/payments-db");
const { getApplication, updateApplication } = require("./admin/db");
const { fetchFromYandex } = require("./yandex-reviews");
const { createAdminRouter } = require("./admin/router");
const { listEvents } = require("./admin/events-db");
const { getAllContent, DEFAULT_CONTENT } = require("./admin/content-db");
const { listPhotos } = require("./admin/gallery-db");
const { listVideos } = require("./admin/video-db");
const { listFleet } = require("./admin/fleet-db");
const { listTents } = require("./admin/tents-db");
const { listMapPoints, ensureMapPoints } = require("./admin/map-points-db");
const { computeAvailability, checkAvailability, violationMessage } = require("./availability");

const app = express();
app.set("trust proxy", 1);
const db = initDb();
ensureMapPoints(db).catch((err) => console.error("map_points init error:", err.message));
const port = Number(process.env.PORT || 3000);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://mc.yandex.ru", "https://challenges.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: ["'self'", "https://mc.yandex.ru", "https://mc.yandex.com", "https://api.open-meteo.com"],
      frameSrc: ["https://challenges.cloudflare.com", "https://yandex.ru"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
}));
app.use(express.json({ limit: "512kb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

app.use('/ostrov-admin', createAdminRouter(db));

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
  const prices = getPrices();
  res.json({
    turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || "",
    perDayItems: prices.perDayItems,
    fixedItems:  prices.fixedItems,
    prepayEnabled: yookassa.isConfigured(),
    prepayPercent: Number(process.env.SBP_DEFAULT_PREPAY_PERCENT || 30),
  });
});

const GENERIC_ERR = "Ошибка сервера. Попробуйте позже.";

app.get("/api/events", async (req, res) => {
  try { res.json(await listEvents(db, true)); }
  catch (err) { console.error("GET /api/events error:", err); res.status(500).json({ error: GENERIC_ERR }); }
});

app.get("/api/content", async (req, res) => {
  try { res.json(await getAllContent(db)); }
  catch (err) { console.error("GET /api/content error:", err); res.json(DEFAULT_CONTENT); }
});

app.get("/api/gallery", async (req, res) => {
  try { res.json(await listPhotos(db, true)); }
  catch (err) { console.error("GET /api/gallery error:", err); res.status(500).json({ error: GENERIC_ERR }); }
});

app.get("/api/video", async (req, res) => {
  try { res.json(await listVideos(db, true)); }
  catch (err) { console.error("GET /api/video error:", err); res.status(500).json({ error: GENERIC_ERR }); }
});

app.get("/api/fleet", async (req, res) => {
  try { res.json(await listFleet(db, true)); }
  catch (err) { console.error("GET /api/fleet error:", err); res.status(500).json({ error: GENERIC_ERR }); }
});

app.get("/api/tents", async (req, res) => {
  try { res.json(await listTents(db, true)); }
  catch (err) { console.error("GET /api/tents error:", err); res.status(500).json({ error: GENERIC_ERR }); }
});

app.get("/api/map-points", async (req, res) => {
  try { res.json(await listMapPoints(db, true)); }
  catch (err) { console.error("GET /api/map-points error:", err); res.status(500).json({ error: GENERIC_ERR }); }
});

app.post("/api/quote", (req, res) => {
  const quote = calculateQuote(req.body || {});
  if (!quote.isValid) {
    return res.status(400).json({ error: "Проверьте даты и количество гостей." });
  }
  return res.json(quote);
});

// Публичная доступность на выбранные даты. Отдаём только свободные остатки
// (минимум по дням окна), без внутренней статистики занятости.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
app.get("/api/availability", async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!DATE_RE.test(from || "") || !DATE_RE.test(to || "") || !(new Date(from) < new Date(to))) {
      return res.status(400).json({ error: "Укажите корректный период." });
    }
    // Ограничиваем окно, чтобы публичный эндпоинт нельзя было раскрутить на годы вперёд.
    const days = (new Date(to) - new Date(from)) / 86400000;
    if (days > 120) return res.status(400).json({ error: "Слишком большой период." });

    const avail = await computeAvailability(db, { from, to, statuses: ["confirmed"] });
    const resources = avail.resources.map((r) => ({ key: r.key, kind: r.kind, label: r.label, free: r.minFree }));
    const camp = resources.find((r) => r.key === "campSpots");
    res.json({ from, to, campFree: camp ? camp.free : null, resources });
  } catch (err) {
    console.error("GET /api/availability error:", err);
    res.status(500).json({ error: GENERIC_ERR });
  }
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
  if (!data.success) {
    console.error("[Turnstile] verification failed:", JSON.stringify(data));
  }
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

    if (payload.name.length > 255 || payload.phone.length > 50) {
      return res.status(400).json({ error: "Слишком длинные данные." });
    }

    if ((payload.comment || '').length > 2000 || (payload.email || '').length > 255) {
      return res.status(400).json({ error: "Слишком длинные данные." });
    }

    // Стоимость считаем, когда есть данные, но это не обязательно:
    // форма-консультация присылает только имя и телефон — заявку всё равно сохраняем.
    const quote = calculateQuote(payload.answers || {});

    const verify = await verifyTurnstile(payload.turnstileToken, req.ip);
    if (!verify.ok) {
      return res.status(400).json({ error: "Проверка безопасности не пройдена." });
    }

    // Защита от овербукинга: если на выбранные даты не хватает мест/палаток/шатров
    // (с учётом подтверждённых заявок и ручных блокировок) — не принимаем заявку.
    // Консультации без дат сюда не попадают (checkAvailability вернёт ok).
    try {
      const avail = await checkAvailability(db, payload.answers || {}, ["confirmed"]);
      if (!avail.ok) {
        return res.status(409).json({ error: violationMessage(avail.violations), overbooked: true });
      }
    } catch (availErr) {
      // Не валим заявку, если расчёт наличия упал — лучше принять лид, чем потерять.
      console.error("Availability check error (non-fatal):", availErr.message);
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

    sendApplicationEmail(appId, payload, quote).catch((err) =>
      console.error("Email send error (async):", err.message)
    );

    sendToGoogleSheets(payload, quote).catch((err) =>
      console.error("Google Sheets error (async):", err.message)
    );

    // TODO: add Telegram bot delivery in next iteration.
    return res.status(201).json({
      ok: true,
      applicationId: appId,
      quote,
    });
  } catch (error) {
    console.error("Application submit error:", error);
    return res.status(500).json({ error: "Ошибка сервера. Попробуйте позже." });
  }
});

// ── Предоплата по СБП (ЮKassa) ──────────────────────────────────────────────

const paymentLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Слишком много попыток оплаты. Попробуйте позже." },
});

function prepayKopecks(quote) {
  const percent = Number(process.env.SBP_DEFAULT_PREPAY_PERCENT || 30);
  const rub = Math.round(((Number(quote?.total) || 0) * percent) / 100);
  return { percent, kopecks: rub * 100 };
}

function buildReturnUrl(req, appId) {
  const base = process.env.SBP_RETURN_URL || `${req.protocol}://${req.get("host")}/payment-result.html`;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}app=${appId}`;
}

// Авто-сценарий: клиент сам инициирует предоплату по % от расчёта.
app.post("/api/applications/:id/payment", paymentLimiter, async (req, res) => {
  try {
    if (!yookassa.isConfigured()) {
      return res.status(503).json({ error: "Онлайн-оплата временно недоступна." });
    }
    const appId = Number(req.params.id);
    if (!Number.isInteger(appId) || appId <= 0) {
      return res.status(400).json({ error: "Некорректная заявка." });
    }
    const application = await getApplication(db, appId);
    if (!application) return res.status(404).json({ error: "Заявка не найдена." });

    const quote = application.quote || {};
    if (!quote.isValid || !(quote.total > 0)) {
      return res.status(400).json({ error: "Для этой заявки нельзя рассчитать предоплату." });
    }

    const existing = await listPaymentsForApplication(db, appId);
    if (existing.some((p) => p.status === "succeeded")) {
      return res.status(409).json({ error: "Заявка уже оплачена." });
    }

    const { percent, kopecks } = prepayKopecks(quote);
    if (kopecks <= 0) return res.status(400).json({ error: "Сумма предоплаты равна нулю." });

    const description = `Предоплата ${percent}% по заявке #${appId} — Парусный Клуб «Остров»`;
    const paymentId = await insertPayment(db, {
      applicationId: appId, amountKopecks: kopecks, description, source: "auto",
      metadata: { prepayPercent: percent },
    });

    const yk = await yookassa.createPayment({
      amountKopecks: kopecks,
      description,
      returnUrl: buildReturnUrl(req, appId),
      email: application.email,
      phone: application.phone,
      metadata: { applicationId: appId, paymentId },
    });

    await updatePayment(db, paymentId, {
      yookassa_id: yk.id,
      status: yk.status,
      confirmation_url: yk.confirmation?.confirmation_url || null,
    });

    return res.status(201).json({
      ok: true,
      amount: kopecks / 100,
      percent,
      confirmationUrl: yk.confirmation?.confirmation_url || null,
    });
  } catch (error) {
    console.error("Create payment error:", error.message);
    return res.status(502).json({ error: "Не удалось создать платёж. Попробуйте позже." });
  }
});

// Обрабатывает событие ЮKassa. Статус берём из API (не доверяем телу запроса).
async function handleWebhookEvent(event) {
  const type = event.event || "";
  const obj = event.object || {};

  if (type.startsWith("refund")) {
    const payment = await getPaymentByYookassaId(db, obj.payment_id);
    if (!payment) return;
    if (obj.status === "succeeded") {
      await updatePayment(db, payment.id, {
        status: "refunded",
        refunded_at: new Date().toISOString(),
        raw_event_json: JSON.stringify(event),
      });
      await recalcPaidAmount(db, payment.application_id);
    }
    return;
  }

  // payment.* — перепроверяем статус через API как источник истины.
  let truth = obj;
  try {
    if (obj.id) truth = await yookassa.getPayment(obj.id);
  } catch (e) {
    console.warn("getPayment in webhook failed, using body:", e.message);
  }

  const payment = await getPaymentByYookassaId(db, truth.id);
  if (!payment) return;

  const wasSucceeded = payment.status === "succeeded";
  const patch = { status: truth.status, raw_event_json: JSON.stringify(event) };
  if (truth.status === "succeeded" && !payment.paid_at) patch.paid_at = new Date().toISOString();
  await updatePayment(db, payment.id, patch);

  if (truth.status === "succeeded" && !wasSucceeded) {
    await recalcPaidAmount(db, payment.application_id);
    const application = await getApplication(db, payment.application_id);
    // Двигаем «Новая» → «В работе»; ручной статус менеджера не перетираем.
    if (application && application.status === "new") {
      await updateApplication(db, payment.application_id, { status: "in_progress" });
    }
    sendPaymentSucceeded({
      applicationId: payment.application_id,
      amountKopecks: payment.amount_kopecks,
      clientEmail: application?.email || "",
    }).catch((err) => console.error("Payment success email error:", err.message));
  }
}

app.post("/api/webhooks/yookassa", async (req, res) => {
  try {
    if (process.env.YOOKASSA_WEBHOOK_IP_CHECK !== "false" && !yookassa.isTrustedWebhookIp(req.ip)) {
      console.warn("Rejected YooKassa webhook from untrusted IP:", req.ip);
      return res.status(200).json({ ok: true }); // подтверждаем, но игнорируем
    }
    await handleWebhookEvent(req.body || {});
    return res.status(200).json({ ok: true });
  } catch (error) {
    // Всегда отвечаем 200, чтобы ЮKassa не зациклила ретраи; ошибку логируем.
    console.error("Webhook error:", error.message);
    return res.status(200).json({ ok: true });
  }
});

const REVIEWS_CACHE_TTL = 24 * 60 * 60 * 1000;

app.get("/api/reviews", (req, res) => {
  db.get(
    "SELECT id, fetched_at, reviews_json FROM reviews_cache ORDER BY id DESC LIMIT 1",
    async (err, row) => {
      const isStale =
        !row || Date.now() - new Date(row.fetched_at).getTime() > REVIEWS_CACHE_TTL;

      if (!isStale) {
        return res.json({ reviews: JSON.parse(row.reviews_json), source: "cache" });
      }

      try {
        const reviews = await fetchFromYandex();
        const now = new Date().toISOString();
        db.run("INSERT INTO reviews_cache (fetched_at, reviews_json) VALUES (?, ?)", [
          now,
          JSON.stringify(reviews),
        ]);
        db.run(
          "DELETE FROM reviews_cache WHERE id < (SELECT min_id FROM (SELECT id AS min_id FROM reviews_cache ORDER BY id DESC LIMIT 1 OFFSET 2) t)"
        );
        return res.json({ reviews, source: "fresh" });
      } catch (fetchErr) {
        console.error("Yandex reviews fetch error:", fetchErr.message);
        if (row) {
          return res.json({ reviews: JSON.parse(row.reviews_json), source: "cache_fallback" });
        }
        return res.status(503).json({
          error: "Не удалось загрузить отзывы.",
          reviews: [],
        });
      }
    }
  );
});

// SEO-файлы отдаём явно с правильным Content-Type,
// чтобы catch-all ниже их не перекрыл
app.get("/sitemap.xml", (req, res) => {
  // lastmod — дата последнего изменения index.html, чтобы не обновлять руками
  const indexPath = path.join(__dirname, "..", "public", "index.html");
  let lastmod = new Date();
  try {
    lastmod = fs.statSync(indexPath).mtime;
  } catch (_) {}
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.send(
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      `  <url>\n` +
      `    <loc>https://pkostrov.ru/</loc>\n` +
      `    <lastmod>${lastmod.toISOString().slice(0, 10)}</lastmod>\n` +
      `    <changefreq>weekly</changefreq>\n` +
      `    <priority>1.0</priority>\n` +
      `  </url>\n` +
      `</urlset>\n`
  );
});

app.get("/robots.txt", (req, res) => {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.sendFile(path.join(__dirname, "..", "public", "robots.txt"));
});

// llms.txt — описание клуба для ИИ-поисковиков (ChatGPT, Perplexity и т.п.)
app.get("/llms.txt", (req, res) => {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.sendFile(path.join(__dirname, "..", "public", "llms.txt"));
});

// Несуществующие пути → честный 404, а не главная со статусом 200
// (иначе поисковики считают это soft-404 и понижают сайт)
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, "..", "public", "404.html"));
});

app.listen(port, () => {
  console.log(`Ostrov app running on http://localhost:${port}`);
});
