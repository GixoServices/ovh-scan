import { test } from "node:test";
import assert from "node:assert/strict";
import { computeMonthlyPrice, PricingService, type RawAddon, type RawPlan, type RegionPriceCatalog } from "./pricing.js";

function monthlyEntry(price: number) {
  return [
    { capacities: ["installation"], commitment: 0, interval: 0, intervalUnit: "none", mode: "default", price: 0 },
    { capacities: ["renew"], commitment: 0, interval: 1, intervalUnit: "month", mode: "default", price },
    {
      capacities: ["renew"],
      commitment: 12,
      interval: 12,
      intervalUnit: "month",
      mode: "upfront12",
      price: price * 10,
    },
  ];
}

function buildCatalog(plans: RawPlan[], addons: RawAddon[], currencyCode = "GBP"): RegionPriceCatalog {
  return {
    currencyCode,
    plansByCode: new Map(plans.map((p) => [p.planCode, p])),
    addonsByCode: new Map(addons.map((a) => [a.planCode, a])),
  };
}

const basePlan: RawPlan = {
  planCode: "plan-a",
  addonFamilies: [
    { name: "memory", addons: ["ram-32g-plan-a", "ram-64g-plan-a"], default: "ram-32g-plan-a" },
    { name: "storage", addons: ["softraid-2x1tb-plan-a", "softraid-4x1tb-plan-a"], default: "softraid-2x1tb-plan-a" },
  ],
  pricings: monthlyEntry(10000),
};

const addons: RawAddon[] = [
  { planCode: "ram-32g-plan-a", pricings: monthlyEntry(0) },
  { planCode: "ram-64g-plan-a", pricings: monthlyEntry(2000) },
  { planCode: "softraid-2x1tb-plan-a", pricings: monthlyEntry(0) },
  { planCode: "softraid-4x1tb-plan-a", pricings: monthlyEntry(5000) },
];

test("computeMonthlyPrice returns base price for a default configuration", () => {
  const catalog = buildCatalog([basePlan], addons);
  const result = computeMonthlyPrice(catalog, {
    planCode: "plan-a",
    memory: "ram-32g",
    storage: "softraid-2x1tb",
  });
  assert.ok(result);
  assert.equal(result!.amount, 10000 / 1e8);
  assert.equal(result!.currency, "GBP");
});

test("computeMonthlyPrice adds addon deltas for an upgraded configuration", () => {
  const catalog = buildCatalog([basePlan], addons);
  const result = computeMonthlyPrice(catalog, {
    planCode: "plan-a",
    memory: "ram-64g",
    storage: "softraid-4x1tb",
  });
  assert.ok(result);
  assert.equal(result!.amount, (10000 + 2000 + 5000) / 1e8);
});

test("computeMonthlyPrice returns null for an unknown plan code", () => {
  const catalog = buildCatalog([basePlan], addons);
  const result = computeMonthlyPrice(catalog, { planCode: "does-not-exist", memory: null, storage: null });
  assert.equal(result, null);
});

test("computeMonthlyPrice handles a region-variant plan code whose addons share a different suffix", () => {
  const variantPlan: RawPlan = {
    planCode: "scale01-v3-mum",
    addonFamilies: [
      { name: "memory", addons: ["ram-128g-scale01-v3", "ram-256g-scale01-v3"], default: "ram-128g-scale01-v3" },
      { name: "storage", addons: ["noraid-0-scale01-v3"], default: "noraid-0-scale01-v3" },
    ],
    pricings: monthlyEntry(50000),
  };
  const variantAddons: RawAddon[] = [
    { planCode: "ram-128g-scale01-v3", pricings: monthlyEntry(0) },
    { planCode: "ram-256g-scale01-v3", pricings: monthlyEntry(3000) },
    { planCode: "noraid-0-scale01-v3", pricings: monthlyEntry(0) },
  ];
  const catalog = buildCatalog([variantPlan], variantAddons);
  const result = computeMonthlyPrice(catalog, {
    planCode: "scale01-v3-mum",
    memory: "ram-256g",
    storage: "noraid-0",
  });
  assert.ok(result);
  assert.equal(result!.amount, (50000 + 3000) / 1e8);
});

test("computeMonthlyPrice returns null on genuine addon ambiguity", () => {
  const ambiguousPlan: RawPlan = {
    planCode: "plan-b",
    addonFamilies: [
      {
        name: "storage",
        addons: ["disk-1tb-x-plan-b", "disk-1tb-y-plan-b"],
        default: "disk-1tb-x-plan-b",
      },
    ],
    pricings: monthlyEntry(10000),
  };
  const catalog = buildCatalog(
    [ambiguousPlan],
    [
      { planCode: "disk-1tb-x-plan-b", pricings: monthlyEntry(0) },
      { planCode: "disk-1tb-y-plan-b", pricings: monthlyEntry(0) },
    ],
  );
  const result = computeMonthlyPrice(catalog, { planCode: "plan-b", memory: null, storage: "disk-1tb" });
  assert.equal(result, null);
});

test("computeMonthlyPrice returns null when no no-commitment monthly entry exists", () => {
  const planWithoutMonthly: RawPlan = {
    planCode: "plan-c",
    addonFamilies: [],
    pricings: [{ capacities: ["installation"], commitment: 0, interval: 0, intervalUnit: "none", mode: "default", price: 100 }],
  };
  const catalog = buildCatalog([planWithoutMonthly], []);
  const result = computeMonthlyPrice(catalog, { planCode: "plan-c", memory: null, storage: null });
  assert.equal(result, null);
});

test("PricingService caches a region and tolerates the other region's fetch failure", async () => {
  let calls = 0;
  const fakeFetch = (async (url: string | URL) => {
    calls += 1;
    if (String(url).includes("ovhSubsidiary=US")) {
      return { ok: false, status: 500, json: async () => ({}) } as unknown as Response;
    }
    return {
      ok: true,
      json: async () => ({ locale: { currencyCode: "GBP" }, plans: [basePlan], addons }),
    } as unknown as Response;
  }) as typeof fetch;

  const service = new PricingService(60_000, 5000, fakeFetch);
  const eu = await service.getCatalog("eu");
  const us = await service.getCatalog("us");
  assert.ok(eu);
  assert.equal(us, null);

  const callsAfterFirst = calls;
  await service.getCatalog("eu");
  assert.equal(calls, callsAfterFirst, "second call within TTL should not refetch");
});

test("PricingService.priceFor returns a computed price end-to-end", async () => {
  const fakeFetch = (async () => {
    return {
      ok: true,
      json: async () => ({ locale: { currencyCode: "GBP" }, plans: [basePlan], addons }),
    } as unknown as Response;
  }) as typeof fetch;

  const service = new PricingService(60_000, 5000, fakeFetch);
  const result = await service.priceFor("eu", { planCode: "plan-a", memory: "ram-32g", storage: "softraid-2x1tb" });
  assert.ok(result);
  assert.match(result!.formatted, /\d/);
});
