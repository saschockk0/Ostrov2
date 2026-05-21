const ORG_ID = process.env.YANDEX_ORG_ID || "107818186926";
// Token obtained from https://oauth.yandex.ru — scope: ybusiness:read
const OAUTH_TOKEN = process.env.YANDEX_OAUTH_TOKEN || "";

// Yandex Business API v1 — requires OAuth token of the org owner
const API_BASE = "https://api.business.yandex.ru/v1";

async function fetchFromYandex() {
  if (!OAUTH_TOKEN) throw new Error("YANDEX_OAUTH_TOKEN not set");

  const url = `${API_BASE}/${ORG_ID}/reviews?limit=30&lang=ru`;
  const res = await fetch(url, {
    headers: {
      Authorization: `OAuth ${OAUTH_TOKEN}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Yandex API ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  return normalize(data);
}

function normalize(data) {
  // Yandex Business API returns { reviews: [...] }
  const items = Array.isArray(data.reviews) ? data.reviews : [];
  return items
    .filter((r) => (r.rating ?? 5) >= 4)
    .slice(0, 20)
    .map((r) => ({
      id: String(r.id ?? Math.random()),
      author: r.author?.name ?? r.authorName ?? "Гость",
      avatarUrl: r.author?.avatarUrl ?? null,
      rating: r.rating ?? 5,
      text: r.text ?? r.comment ?? "",
      date: r.updatedTime ?? r.createdTime ?? new Date().toISOString(),
      photos: (r.photos ?? [])
        .map((p) => p.url ?? p.urlTemplate ?? "")
        .filter(Boolean),
    }));
}

module.exports = { fetchFromYandex };
