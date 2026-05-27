require("dotenv").config();

const path = require("path");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const { calculateQuote, getPrices } = require("./pricing");
const { initDb, insertApplication } = require("./database");
const { sendToGoogleSheets } = require("./googleSheets");
const { sendApplicationEmail } = require("./email");
const { fetchFromYandex } = require("./yandex-reviews");
const { createAdminRouter } = require("./admin/router");
const { listEvents } = require("./admin/events-db");
const { getAllContent } = require("./admin/content-db");
const { listPhotos } = require("./admin/gallery-db");

const app = express();
app.set("trust proxy", 1);
const db = initDb();
const port = Number(process.env.PORT || 3000);

app.use(helmet({ contentSecurityPolicy: false }));
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
  });
});

app.get("/api/events", async (req, res) => {
  try { res.json(await listEvents(db, true)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/content", async (req, res) => {
  try { res.json(await getAllContent(db)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/gallery", async (req, res) => {
  try { res.json(await listPhotos(db, true)); }
  catch (err) { res.status(500).json({ error: err.message }); }
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
          error: "Не удалось загрузить отзывы. Проверьте YANDEX_OAUTH_TOKEN в .env",
          reviews: [],
        });
      }
    }
  );
});

// SEO-файлы отдаём явно с правильным Content-Type,
// чтобы catch-all ниже их не перекрыл
app.get("/sitemap.xml", (req, res) => {
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.sendFile(path.join(__dirname, "..", "public", "sitemap.xml"));
});

app.get("/robots.txt", (req, res) => {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.sendFile(path.join(__dirname, "..", "public", "robots.txt"));
});

// Все прочие пути → SPA
app.use((req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.listen(port, () => {
  console.log(`Ostrov app running on http://localhost:${port}`);
});
