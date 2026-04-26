import pricingModule from "../../../src/pricing";

const { calculateQuote } = pricingModule;

export const runtime = "nodejs";

export async function POST(request) {
  const payload = await request.json().catch(() => ({}));
  const quote = calculateQuote(payload || {});
  if (!quote.isValid) {
    return Response.json({ error: "Проверьте даты и количество гостей." }, { status: 400 });
  }
  return Response.json(quote);
}
