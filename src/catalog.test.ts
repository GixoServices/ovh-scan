import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classify,
  normalizeEntries,
  filterCatalog,
  computeFacets,
  parseMemorySizeGb,
  CatalogService,
  type RawServerEntry,
} from "./catalog.js";

test("classify treats lead-time codes as available", () => {
  assert.equal(classify("1H-high"), "available");
  assert.equal(classify("1H-low"), "available");
  assert.equal(classify("24H-low"), "available");
  assert.equal(classify("72H"), "available");
  assert.equal(classify("720H"), "available");
  assert.equal(classify("1440H"), "available");
});

test("classify treats unavailable/unknown as not_available", () => {
  assert.equal(classify("unavailable"), "not_available");
  assert.equal(classify("unknown"), "not_available");
});

test("classify treats comingSoon as not_available (not yet orderable)", () => {
  assert.equal(classify("comingSoon"), "not_available");
});

test("classify defaults an unrecognized future code to not_available", () => {
  assert.equal(classify("somethingOvhInventsLater"), "not_available");
});

test("normalizeEntries produces one record per datacenter", () => {
  const raw: RawServerEntry[] = [
    {
      fqn: "plan.mem.storage",
      planCode: "plan-a",
      server: "srv-a",
      memory: "ram-32g",
      storage: "softraid-2x1000sa",
      datacenters: [
        { datacenter: "rbx", availability: "1H-high" },
        { datacenter: "gra", availability: "unavailable" },
      ],
    },
  ];
  const entries = normalizeEntries(raw, "eu");
  assert.equal(entries.length, 2);
  assert.equal(entries[0].datacenter, "rbx");
  assert.equal(entries[0].classification, "available");
  assert.equal(entries[1].datacenter, "gra");
  assert.equal(entries[1].classification, "not_available");
  assert.equal(entries[0].region, "eu");
});

const sample = normalizeEntries(
  [
    {
      fqn: "a",
      planCode: "plan-a",
      server: "srv-a",
      memory: "ram-32g-ecc-2400",
      storage: "softraid-2x1000sa",
      datacenters: [{ datacenter: "rbx", availability: "1H-high" }],
    },
    {
      fqn: "b",
      planCode: "plan-b",
      server: "srv-b",
      memory: "ram-64g-ecc-2933",
      storage: "softraid-2x960nvme",
      datacenters: [{ datacenter: "gra", availability: "unavailable" }],
    },
  ],
  "eu",
);

test("filterCatalog matches free-text substring case-insensitively", () => {
  const result = filterCatalog(sample, { q: "PLAN-A" });
  assert.equal(result.length, 1);
  assert.equal(result[0].planCode, "plan-a");
});

test("filterCatalog combines multiple filters with AND semantics", () => {
  const result = filterCatalog(sample, { region: "eu", datacenters: ["rbx"], availability: "available" });
  assert.equal(result.length, 1);
  assert.equal(result[0].datacenter, "rbx");
});

test("filterCatalog with no filters returns everything", () => {
  assert.equal(filterCatalog(sample, {}).length, 2);
});

test("filterCatalog returns empty when nothing matches", () => {
  assert.equal(filterCatalog(sample, { q: "does-not-exist" }).length, 0);
});

test("computeFacets returns distinct sorted values", () => {
  const facets = computeFacets(sample);
  assert.deepEqual(facets.datacenters, ["gra", "rbx"]);
  assert.deepEqual(facets.memorySizes, [32, 64]);
});

test("parseMemorySizeGb extracts the GB size from real memory strings", () => {
  assert.equal(parseMemorySizeGb("ram-32g-ecc-2400"), 32);
  assert.equal(parseMemorySizeGb("ram-128g-ddr5-on-die-ecc-3600"), 128);
  assert.equal(parseMemorySizeGb("ram-1024g-ecc-4800"), 1024);
  assert.equal(parseMemorySizeGb(null), null);
  assert.equal(parseMemorySizeGb("not-a-memory-string"), null);
});

test("filterCatalog matches one of several selected memory sizes (OR semantics)", () => {
  const result = filterCatalog(sample, { memorySizes: [32, 64] });
  assert.equal(result.length, 2);

  const only64 = filterCatalog(sample, { memorySizes: [64] });
  assert.equal(only64.length, 1);
  assert.equal(only64[0].planCode, "plan-b");
});

test("filterCatalog matches storage by case-insensitive substring", () => {
  const result = filterCatalog(sample, { storage: "NVME" });
  assert.equal(result.length, 1);
  assert.equal(result[0].planCode, "plan-b");
});

test("filterCatalog combines memory sizes and storage substring with AND semantics", () => {
  const result = filterCatalog(sample, { memorySizes: [32], storage: "nvme" });
  assert.equal(result.length, 0);
});

test("CatalogService caches a region for the configured TTL", async () => {
  let calls = 0;
  const fakeFetch = (async () => {
    calls += 1;
    return {
      ok: true,
      json: async () => [],
    } as unknown as Response;
  }) as typeof fetch;

  const service = new CatalogService(30_000, 5_000, fakeFetch);
  await service.getCatalog();
  await service.getCatalog();
  // Two regions (us, eu) fetched once each on first call; second call within TTL should not refetch.
  assert.equal(calls, 2);
});

test("CatalogService keeps data from a healthy region when the other fails", async () => {
  const fakeFetch = (async (url: string | URL) => {
    if (String(url).includes("api.us.ovhcloud.com")) {
      return { ok: false, status: 500, json: async () => [] } as unknown as Response;
    }
    return {
      ok: true,
      json: async () => [
        {
          fqn: "eu-plan",
          planCode: "eu-plan",
          server: "eu-srv",
          datacenters: [{ datacenter: "rbx", availability: "1H-high" }],
        },
      ],
    } as unknown as Response;
  }) as typeof fetch;

  const service = new CatalogService(30_000, 5_000, fakeFetch);
  const { entries, degradedRegions } = await service.getCatalog();
  assert.ok(degradedRegions.includes("us"));
  assert.ok(entries.some((e) => e.region === "eu" && e.planCode === "eu-plan"));
});
