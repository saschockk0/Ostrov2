import databaseModule from "../../../src/database";
import emailModule from "../../../src/email";
import pricingModule from "../../../src/pricing";

const { initDb, insertApplication } = databaseModule;
const { sendApplicationEmail } = emailModule;
const { calculateQuote } = pricingModule;

const db = initDb();
const attemptsByIp = new Map();

export const runtime = "nodejs";

function isRateLimited(ip) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const max = 8;

  const stored = attemptsByIp.get(ip) || [];
  const valid = stored.filter((stamp) => now - stamp < windowMs);
  if (valid.length >= max) return true;
  valid.push(now);
  attemptsByIp.set(ip, valid);
  return false;
}

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

export async function POST(request) {
  try {
    const payload = await request.json().catch(() => ({}));
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";

    if (isRateLimited(ip)) {
      return Response.json({ error: "Слишком много попыток. Попробуйте позже." }, { status: 429 });
    }

    if (payload.website) {
      return Response.json({ error: "Подозрительный запрос." }, { status: 400 });
    }
    if (!payload.name || !payload.phone) {
      return Response.json({ error: "Введите имя и телефон." }, { status: 400 });
    }

    // Contact-only leads (no dates / short track) are allowed: store without a quote.
    const isContactOnly = payload.clientType === "contact";
    const rawQuote = calculateQuote(payload.answers || {});
    if (!rawQuote.isValid && !isContactOnly) {
      return Response.json({ error: "Не удалось рассчитать стоимость." }, { status: 400 });
    }
    const quote = rawQuote.isValid ? rawQuote : null;

    const verify = await verifyTurnstile(payload.turnstileToken, ip);
    if (!verify.ok) {
      return Response.json({ error: "Проверка безопасности не пройдена." }, { status: 400 });
    }

    const applicationId = await insertApplication(db, {
      clientType: payload.clientType,
      name: payload.name,
      phone: payload.phone,
      messenger: payload.messenger,
      email: payload.email,
      comment: payload.comment,
      answers: payload.answers,
      quote,
    });

    const emailStatus = await sendApplicationEmail(applicationId, payload, quote);

    return Response.json(
      {
        ok: true,
        applicationId,
        quote,
        emailSent: emailStatus.sent,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Application submit error:", error);
    return Response.json({ error: "Ошибка сервера. Попробуйте позже." }, { status: 500 });
  }
}
