import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "./db.js";
import { WatchlistStore } from "./watchlist.js";
import { WebhookStore } from "./webhooks.js";
import { buildServer } from "./server.js";
import type { CatalogService } from "./catalog.js";
import type { PricingService } from "./pricing.js";

function fakeCatalog(entries: any[]): CatalogService {
  return { getCatalog: async () => ({ entries, degradedRegions: [] }) } as unknown as CatalogService;
}

function fakePricing(priceByPlanCode: Record<string, number>): PricingService {
  return {
    getCatalog: async (region: string) => ({ region }),
    priceFor: async () => null,
  } as unknown as PricingService;
}

const sampleEntry = {
  region: "eu",
  planCode: "plan-a",
  datacenter: "rbx",
  fqn: "plan-a.fqn",
  server: "srv-a",
  memory: "ram-32g",
  storage: "softraid-2x1tb",
  rawAvailability: "1H-high",
  classification: "available",
};

test("GET /api/catalog attaches a null price when pricing has no data for the region", async () => {
  const db = openDatabase(":memory:");
  const app = buildServer({
    catalog: fakeCatalog([sampleEntry]),
    watchlist: new WatchlistStore(db),
    webhooks: new WebhookStore(db),
    pricing: { getCatalog: async () => null } as unknown as PricingService,
  });

  const res = await app.inject({ method: "GET", url: "/api/catalog" });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.entries.length, 1);
  assert.equal(body.entries[0].price, null);
});

test("GET /api/catalog attaches a computed price when pricing data matches", async () => {
  const db = openDatabase(":memory:");
  const monthly = (price: number) => [
    { capacities: ["renew"], commitment: 0, interval: 1, intervalUnit: "month", mode: "default", price },
  ];
  const fakeRegionCatalog = {
    currencyCode: "GBP",
    plansByCode: new Map([
      [
        "plan-a",
        {
          planCode: "plan-a",
          addonFamilies: [
            { name: "memory", addons: ["ram-32g-plan-a"], default: "ram-32g-plan-a" },
            { name: "storage", addons: ["softraid-2x1tb-plan-a"], default: "softraid-2x1tb-plan-a" },
          ],
          pricings: monthly(100000000),
        },
      ],
    ]),
    addonsByCode: new Map([
      ["ram-32g-plan-a", { planCode: "ram-32g-plan-a", pricings: monthly(0) }],
      ["softraid-2x1tb-plan-a", { planCode: "softraid-2x1tb-plan-a", pricings: monthly(0) }],
    ]),
  };

  const app = buildServer({
    catalog: fakeCatalog([sampleEntry]),
    watchlist: new WatchlistStore(db),
    webhooks: new WebhookStore(db),
    pricing: { getCatalog: async () => fakeRegionCatalog } as unknown as PricingService,
  });

  const res = await app.inject({ method: "GET", url: "/api/catalog" });
  const body = res.json();
  assert.equal(body.entries[0].price.amount, 1);
  assert.equal(body.entries[0].price.currency, "GBP");
});

test("GET /api/catalog still returns availability data when pricing lookup throws", async () => {
  const db = openDatabase(":memory:");
  const app = buildServer({
    catalog: fakeCatalog([sampleEntry]),
    watchlist: new WatchlistStore(db),
    webhooks: new WebhookStore(db),
    pricing: {
      getCatalog: async () => {
        throw new Error("upstream pricing fetch failed");
      },
    } as unknown as PricingService,
  });

  const res = await app.inject({ method: "GET", url: "/api/catalog" });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.entries.length, 1);
  assert.equal(body.entries[0].price, null);
});

test("POST /api/webhooks/:id/test returns 404 for an unknown id", async () => {
  const db = openDatabase(":memory:");
  const app = buildServer({
    catalog: fakeCatalog([]),
    watchlist: new WatchlistStore(db),
    webhooks: new WebhookStore(db),
    pricing: { getCatalog: async () => null } as unknown as PricingService,
  });

  const res = await app.inject({ method: "POST", url: "/api/webhooks/999/test" });
  assert.equal(res.statusCode, 404);
});

test("POST /api/webhooks/:id/test reports the delivery outcome for a known webhook", async () => {
  const db = openDatabase(":memory:");
  const webhooks = new WebhookStore(db);
  const hook = webhooks.add("https://example.com/hook", null);
  const app = buildServer({
    catalog: fakeCatalog([]),
    watchlist: new WatchlistStore(db),
    webhooks,
    pricing: { getCatalog: async () => null } as unknown as PricingService,
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({ ok: true, status: 200 }) as unknown as Response) as typeof fetch;
  try {
    const res = await app.inject({ method: "POST", url: `/api/webhooks/${hook.id}/test` });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.ok, true);
    assert.equal(body.statusCode, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
