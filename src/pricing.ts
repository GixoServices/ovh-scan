import type { Region } from "./catalog.js";

export interface RawPricingEntry {
  capacities: string[];
  commitment: number;
  interval: number;
  intervalUnit: string;
  mode: string;
  price: number;
}

export interface RawAddonFamily {
  name: string;
  addons: string[];
  default: string;
}

export interface RawPlan {
  planCode: string;
  addonFamilies: RawAddonFamily[];
  pricings: RawPricingEntry[];
}

export interface RawAddon {
  planCode: string;
  pricings: RawPricingEntry[];
}

interface RawCatalog {
  locale?: { currencyCode?: string };
  plans: RawPlan[];
  addons: RawAddon[];
}

export interface RegionPriceCatalog {
  currencyCode: string;
  plansByCode: Map<string, RawPlan>;
  addonsByCode: Map<string, RawAddon>;
}

export interface PriceResult {
  amount: number;
  currency: string;
  formatted: string;
}

export interface PriceableEntry {
  planCode: string;
  memory: string | null;
  storage: string | null;
  systemStorage?: string | null;
}

const CATALOG_NAMES = ["baremetalServers", "eco"] as const;

const REGION_CATALOG_CONFIG: Record<Region, { base: string; subsidiary: string }> = {
  eu: { base: "https://api.eu.ovhcloud.com", subsidiary: "GB" },
  us: { base: "https://api.us.ovhcloud.com", subsidiary: "US" },
};

const FAMILY_NAME_BY_FIELD: Record<"memory" | "storage" | "systemStorage", string> = {
  memory: "memory",
  storage: "storage",
  systemStorage: "system-storage",
};

function pickMonthlyPrice(pricings: RawPricingEntry[]): number | null {
  const entry = pricings.find(
    (p) =>
      p.capacities.includes("renew") &&
      p.interval === 1 &&
      p.intervalUnit === "month" &&
      p.commitment === 0 &&
      p.mode === "default",
  );
  return entry ? entry.price : null;
}

function matchAddonCode(family: RawAddonFamily | undefined, fieldValue: string | null | undefined): string | null {
  if (!family || !fieldValue) return null;
  const prefix = `${fieldValue}-`;
  const candidates = family.addons.filter((code) => code.startsWith(prefix));
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  const shortest = candidates.reduce((a, b) => (b.length < a.length ? b : a));
  const shortestCount = candidates.filter((c) => c.length === shortest.length).length;
  return shortestCount === 1 ? shortest : null;
}

export function computeMonthlyPrice(
  catalog: RegionPriceCatalog,
  entry: PriceableEntry,
): PriceResult | null {
  const plan = catalog.plansByCode.get(entry.planCode);
  if (!plan) return null;

  const basePrice = pickMonthlyPrice(plan.pricings);
  if (basePrice === null) return null;

  const familiesByName = new Map(plan.addonFamilies.map((f) => [f.name, f]));
  let total = basePrice;

  const fields: Array<["memory" | "storage" | "systemStorage", string | null | undefined]> = [
    ["memory", entry.memory],
    ["storage", entry.storage],
    ["systemStorage", entry.systemStorage],
  ];

  for (const [field, value] of fields) {
    if (!value) continue;
    const family = familiesByName.get(FAMILY_NAME_BY_FIELD[field]);
    const addonCode = matchAddonCode(family, value);
    if (!addonCode) return null;
    const addon = catalog.addonsByCode.get(addonCode);
    if (!addon) return null;
    const addonPrice = pickMonthlyPrice(addon.pricings);
    if (addonPrice === null) return null;
    total += addonPrice;
  }

  const amount = total / 1e8;
  let formatted: string;
  try {
    formatted = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: catalog.currencyCode,
    }).format(amount);
  } catch {
    formatted = `${amount.toFixed(2)} ${catalog.currencyCode}`;
  }

  return { amount, currency: catalog.currencyCode, formatted };
}

interface RegionCacheEntry {
  catalog: RegionPriceCatalog;
  fetchedAt: number;
  degraded: boolean;
}

export class PricingService {
  private cache = new Map<Region, RegionCacheEntry>();
  private pending = new Map<Region, Promise<void>>();

  constructor(
    private readonly cacheTtlMs: number,
    private readonly fetchTimeoutMs: number,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async fetchCatalog(region: Region, catalogName: (typeof CATALOG_NAMES)[number]): Promise<RawCatalog> {
    const { base, subsidiary } = REGION_CATALOG_CONFIG[region];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.fetchTimeoutMs);
    try {
      const url = `${base}/v1/order/catalog/public/${catalogName}?ovhSubsidiary=${subsidiary}`;
      const res = await this.fetchImpl(url, { signal: controller.signal });
      if (!res.ok) {
        throw new Error(`OVH order catalog ${catalogName}/${region} returned HTTP ${res.status}`);
      }
      return (await res.json()) as RawCatalog;
    } finally {
      clearTimeout(timer);
    }
  }

  private async refreshRegion(region: Region): Promise<void> {
    try {
      const catalogs = await Promise.all(CATALOG_NAMES.map((name) => this.fetchCatalog(region, name)));
      const plansByCode = new Map<string, RawPlan>();
      const addonsByCode = new Map<string, RawAddon>();
      let currencyCode = REGION_CATALOG_CONFIG[region].subsidiary === "US" ? "USD" : "GBP";

      for (const catalog of catalogs) {
        if (catalog.locale?.currencyCode) currencyCode = catalog.locale.currencyCode;
        for (const plan of catalog.plans) plansByCode.set(plan.planCode, plan);
        for (const addon of catalog.addons) addonsByCode.set(addon.planCode, addon);
      }

      this.cache.set(region, {
        catalog: { currencyCode, plansByCode, addonsByCode },
        fetchedAt: Date.now(),
        degraded: false,
      });
    } catch {
      const existing = this.cache.get(region);
      if (existing) {
        this.cache.set(region, { ...existing, degraded: true });
      }
      // No prior cache and the fetch failed: leave this region absent from the
      // cache entirely so callers correctly treat it as having no pricing yet.
    }
  }

  async getCatalog(region: Region): Promise<RegionPriceCatalog | null> {
    const cached = this.cache.get(region);
    const stale = !cached || Date.now() - cached.fetchedAt >= this.cacheTtlMs;
    if (stale) {
      let inFlight = this.pending.get(region);
      if (!inFlight) {
        inFlight = this.refreshRegion(region).finally(() => this.pending.delete(region));
        this.pending.set(region, inFlight);
      }
      await inFlight;
    }
    return this.cache.get(region)?.catalog ?? null;
  }

  async priceFor(region: Region, entry: PriceableEntry): Promise<PriceResult | null> {
    const catalog = await this.getCatalog(region);
    if (!catalog) return null;
    return computeMonthlyPrice(catalog, entry);
  }
}
