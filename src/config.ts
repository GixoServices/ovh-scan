import path from "node:path";

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  port: intFromEnv("PORT", 3000),
  dataDir: process.env.DATA_DIR ?? path.join(process.cwd(), "data"),
  pollIntervalSeconds: intFromEnv("POLL_INTERVAL_SECONDS", 300),
  catalogCacheSeconds: intFromEnv("CATALOG_CACHE_SECONDS", 30),
  maxWebhookAttempts: intFromEnv("MAX_WEBHOOK_ATTEMPTS", 5),
  fetchTimeoutMs: intFromEnv("OVH_FETCH_TIMEOUT_MS", 15000),
  priceCacheSeconds: intFromEnv("PRICE_CACHE_SECONDS", 21600),
  priceFetchTimeoutMs: intFromEnv("PRICE_FETCH_TIMEOUT_MS", 30000),
};

export const dbPath = path.join(config.dataDir, "data.db");
