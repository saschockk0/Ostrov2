import pricingModule from "../../../src/pricing";

const { PER_DAY_ITEMS, FIXED_ITEMS } = pricingModule;

export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || "",
    perDayItems: PER_DAY_ITEMS,
    fixedItems: FIXED_ITEMS,
  });
}
