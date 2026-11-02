export type Region = "us" | "eu";
export type Classification = "available" | "not_available";

export const REGION_ENDPOINTS: Record<Region, string> = {
  us: "https://api.us.ovhcloud.com/v1/dedicated/server/datacenter/availabilities",
  eu: "https://api.eu.ovhcloud.com/v1/dedicated/server/datacenter/availabilities",
};

export interface RawDatacenterAvailability {
  datacenter: string;
  availability: string;
}

export interface RawServerEntry {
  fqn: string;
  planCode: string;
  server: string;
  memory?: string;
  storage?: string;
  systemStorage?: string;
  datacenters: RawDatacenterAvailability[];
}

export interface NormalizedEntry {
  region: Region;
  planCode: string;
  datacenter: string;
  fqn: string;
  server: string;
  memory: string | null;
  storage: string | null;
  rawAvailability: string;
  classification: Classification;
}

export interface CatalogFilters {
  q?: string;
  region?: Region;
  datacenters?: string[];
  memorySizes?: number[];
  storage?: string;
  availability?: Classification | "all";
}

export interface CatalogFacets {
  regions: Region[];
  datacenters: string[];
  memorySizes: number[];
}

const LEAD_TIME_PATTERN = /^\d+H(-high|-low)?$/i;

export function classify(rawAvailability: string): Classification {
  return LEAD_TIME_PATTERN.test(rawAvailability) ? "available" : "not_available";
}

export function parseMemorySizeGb(memory: string | null): number | null {
  if (!memory) return null;
  const match = /(\d+)g\b/i.exec(memory);
  if (!match) return null;
  const size = Number.parseInt(match[1], 10);
  return Number.isFinite(size) ? size : null;
}

export function normalizeEntries(raw: RawServerEntry[], region: Region): NormalizedEntry[] {
  const out: NormalizedEntry[] = [];
  for (const entry of raw) {
    for (const dc of entry.datacenters ?? []) {
      out.push({
        region,
        planCode: entry.planCode,
        datacenter: dc.datacenter,
        fqn: entry.fqn,
        server: entry.server,
        memory: entry.memory ?? null,
        storage: entry.storage ?? null,
        rawAvailability: dc.availability,
        classification: classify(dc.availability),
      });
    }
  }
  return out;
}

export function filterCatalog(entries: NormalizedEntry[], filters: CatalogFilters): NormalizedEntry[] {
  const q = filters.q?.trim().toLowerCase();
  const datacenterSet = filters.datacenters?.length ? new Set(filters.datacenters) : null;
  const memorySizeSet = filters.memorySizes?.length ? new Set(filters.memorySizes) : null;
  const storageQuery = filters.storage?.trim().toLowerCase();

  return entries.filter((entry) => {
    if (filters.region && entry.region !== filters.region) return false;
    if (datacenterSet && !datacenterSet.has(entry.datacenter)) return false;
    if (memorySizeSet) {
      const size = parseMemorySizeGb(entry.memory);
      if (size === null || !memorySizeSet.has(size)) return false;
    }
    if (storageQuery && !entry.storage?.toLowerCase().includes(storageQuery)) return false;
    if (filters.availability && filters.availability !== "all" && entry.classification !== filters.availability) {
      return false;
    }
    if (q) {
      const haystack = `${entry.planCode} ${entry.server} ${entry.fqn}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

export function computeFacets(entries: NormalizedEntry[]): CatalogFacets {
  const regions = new Set<Region>();
  const datacenters = new Set<string>();
  const memorySizes = new Set<number>();

  for (const entry of entries) {
    regions.add(entry.region);
    datacenters.add(entry.datacenter);
    const size = parseMemorySizeGb(entry.memory);
    if (size !== null) memorySizes.add(size);
  }

  return {
    regions: [...regions].sort(),
    datacenters: [...datacenters].sort(),
    memorySizes: [...memorySizes].sort((a, b) => a - b),
  };
}

interface RegionCacheEntry {
  data: NormalizedEntry[];
  fetchedAt: number;
  degraded: boolean;
  error?: string;
}

export class CatalogService {
  private cache = new Map<Region, RegionCacheEntry>();

  constructor(
    private readonly cacheTtlMs: number,
    private readonly fetchTimeoutMs: number,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async fetchRegion(region: Region): Promise<RawServerEntry[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.fetchTimeoutMs);
    try {
      const res = await this.fetchImpl(REGION_ENDPOINTS[region], { signal: controller.signal });
      if (!res.ok) {
        throw new Error(`OVH ${region} endpoint returned HTTP ${res.status}`);
      }
      return (await res.json()) as RawServerEntry[];
    } finally {
      clearTimeout(timer);
    }
  }

  private async refreshRegion(region: Region): Promise<void> {
    try {
      const raw = await this.fetchRegion(region);
      this.cache.set(region, {
        data: normalizeEntries(raw, region),
        fetchedAt: Date.now(),
        degraded: false,
      });
    } catch (err) {
      const existing = this.cache.get(region);
      this.cache.set(region, {
        data: existing?.data ?? [],
        fetchedAt: existing?.fetchedAt ?? 0,
        degraded: true,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async getCatalog(): Promise<{ entries: NormalizedEntry[]; degradedRegions: Region[] }> {
    const now = Date.now();
    const regions = Object.keys(REGION_ENDPOINTS) as Region[];
    await Promise.all(
      regions.map((region) => {
        const cached = this.cache.get(region);
        const stale = !cached || now - cached.fetchedAt >= this.cacheTtlMs;
        return stale ? this.refreshRegion(region) : Promise.resolve();
      }),
    );

    const entries: NormalizedEntry[] = [];
    const degradedRegions: Region[] = [];
    for (const region of regions) {
      const cached = this.cache.get(region);
      if (!cached) continue;
      entries.push(...cached.data);
      if (cached.degraded) degradedRegions.push(region);
    }
    return { entries, degradedRegions };
  }
}
