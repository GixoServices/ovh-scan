import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { CatalogService, computeFacets, filterCatalog, type Classification, type NormalizedEntry, type Region } from "./catalog.js";
import { WatchlistStore } from "./watchlist.js";
import { WebhookStore, sendTestWebhook } from "./webhooks.js";
import { PricingService, computeMonthlyPrice, cpuFor, type PriceResult, type RegionPriceCatalog } from "./pricing.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface BuildOptions {
  catalog: CatalogService;
  watchlist: WatchlistStore;
  webhooks: WebhookStore;
  pricing: PricingService;
  publicDir?: string;
}

type PricedEntry = NormalizedEntry & { price: PriceResult | null };

type PriceCatalogs = Map<Region, RegionPriceCatalog | null>;

// Load each region's pricing catalog once per request so CPU and price
// enrichment share a single lookup (and a single timeout on failure).
async function loadPriceCatalogs(entries: NormalizedEntry[], pricing: PricingService): Promise<PriceCatalogs> {
  const regions = [...new Set(entries.map((e) => e.region))];
  return new Map(
    await Promise.all(
      regions.map(async (region) => {
        try {
          return [region, await pricing.getCatalog(region)] as const;
        } catch {
          return [region, null] as const;
        }
      }),
    ),
  );
}

function attachPrices(entries: NormalizedEntry[], catalogs: PriceCatalogs): PricedEntry[] {
  return entries.map((entry) => {
    const catalog = catalogs.get(entry.region);
    const price = catalog ? computeMonthlyPrice(catalog, entry) : null;
    return { ...entry, price };
  });
}

function attachCpu(entries: NormalizedEntry[], catalogs: PriceCatalogs): NormalizedEntry[] {
  return entries.map((entry) => {
    const catalog = catalogs.get(entry.region);
    return { ...entry, cpu: catalog ? cpuFor(catalog, entry.planCode) : null };
  });
}

const MAX_PAGE_SIZE = 200;

function clampInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function parseIntList(value: string | undefined): number[] | undefined {
  if (!value) return undefined;
  return value
    .split(",")
    .map((v) => Number.parseInt(v, 10))
    .filter((n) => Number.isFinite(n));
}

function parseAvailability(value: unknown): Classification | "all" | undefined {
  if (value === "available" || value === "not_available" || value === "all") return value;
  return undefined;
}

export function buildServer(opts: BuildOptions): FastifyInstance {
  const app = Fastify({ logger: true });

  app.register(fastifyStatic, {
    root: opts.publicDir ?? path.join(__dirname, "..", "public"),
  });

  app.get("/api/catalog", async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;
    const page = clampInt(query.page, 1, 1, Number.MAX_SAFE_INTEGER);
    const pageSize = clampInt(query.pageSize, 50, 1, MAX_PAGE_SIZE);
    const { entries, degradedRegions } = await opts.catalog.getCatalog();
    // Only look up CPU data for the requested region so an unrelated region's
    // slow/unavailable pricing endpoint can't delay this request.
    const region = query.region as Region | undefined;
    const inRegion = region ? entries.filter((e) => e.region === region) : entries;
    const catalogs = await loadPriceCatalogs(inRegion, opts.pricing);
    const withCpu = attachCpu(inRegion, catalogs);
    const filtered = filterCatalog(withCpu, {
      q: query.q,
      region: query.region as Region | undefined,
      datacenters: query.datacenter ? query.datacenter.split(",") : undefined,
      memorySizes: query.memory
        ? query.memory
            .split(",")
            .map((v) => Number.parseInt(v, 10))
            .filter((n) => Number.isFinite(n))
        : undefined,
      cores: parseIntList(query.cores),
      threads: parseIntList(query.threads),
      storage: query.storage,
      availability: parseAvailability(query.availability),
    });
    const priced = attachPrices(filtered, catalogs);
    if (query.sort === "price") {
      const dir = query.dir === "desc" ? -1 : 1;
      priced.sort((a, b) => {
        if (!a.price && !b.price) return 0;
        if (!a.price) return 1;
        if (!b.price) return -1;
        return (a.price.amount - b.price.amount) * dir;
      });
    }
    const start = (page - 1) * pageSize;
    const paginated = priced.slice(start, start + pageSize);
    return reply.send({ entries: paginated, degradedRegions, page, pageSize, total: priced.length });
  });

  app.get("/api/catalog/facets", async (_req, reply) => {
    const { entries, degradedRegions } = await opts.catalog.getCatalog();
    const catalogs = await loadPriceCatalogs(entries, opts.pricing);
    const withCpu = attachCpu(entries, catalogs);
    return reply.send({ facets: computeFacets(withCpu), degradedRegions });
  });

  app.get("/api/watchlist", async (_req, reply) => {
    return reply.send({ items: opts.watchlist.list() });
  });

  app.post("/api/watchlist", async (req, reply) => {
    const body = req.body as {
      region?: Region;
      planCode?: string;
      datacenter?: string;
      fqn?: string;
      server?: string;
    };
    if (!body.region || !body.planCode || !body.datacenter || !body.fqn || !body.server) {
      return reply.code(400).send({ error: "region, planCode, datacenter, fqn, and server are required" });
    }
    const entry = opts.watchlist.add({
      region: body.region,
      planCode: body.planCode,
      datacenter: body.datacenter,
      fqn: body.fqn,
      server: body.server,
    });
    return reply.code(201).send({ item: entry });
  });

  app.delete("/api/watchlist/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const removed = opts.watchlist.remove(Number(id));
    if (!removed) return reply.code(404).send({ error: "not found" });
    return reply.code(204).send();
  });

  app.get("/api/webhooks", async (_req, reply) => {
    return reply.send({ items: opts.webhooks.list() });
  });

  app.post("/api/webhooks", async (req, reply) => {
    const body = req.body as { url?: string; secret?: string };
    if (!body.url) return reply.code(400).send({ error: "url is required" });
    try {
      const destination = opts.webhooks.add(body.url, body.secret?.trim() ? body.secret : null);
      return reply.code(201).send({ item: destination });
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.delete("/api/webhooks/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const removed = opts.webhooks.remove(Number(id));
    if (!removed) return reply.code(404).send({ error: "not found" });
    return reply.code(204).send();
  });

  app.post("/api/webhooks/:id/test", async (req, reply) => {
    const { id } = req.params as { id: string };
    const webhook = opts.webhooks.getById(Number(id));
    if (!webhook) return reply.code(404).send({ error: "not found" });
    const result = await sendTestWebhook(webhook);
    return reply.send(result);
  });

  return app;
}
