import { config, dbPath } from "./config.js";
import { openDatabase } from "./db.js";
import { CatalogService } from "./catalog.js";
import { PricingService } from "./pricing.js";
import { WatchlistStore } from "./watchlist.js";
import { WebhookStore, DeliveryQueue } from "./webhooks.js";
import { Poller } from "./polling.js";
import { DeliveryWorker } from "./deliveryWorker.js";
import { buildServer } from "./server.js";

async function main() {
  const db = openDatabase(dbPath);

  const catalog = new CatalogService(config.catalogCacheSeconds * 1000, config.fetchTimeoutMs);
  const pricing = new PricingService(config.priceCacheSeconds * 1000, config.priceFetchTimeoutMs);
  const watchlist = new WatchlistStore(db);
  const webhooks = new WebhookStore(db);
  const deliveryQueue = new DeliveryQueue(db, config.maxWebhookAttempts);

  const poller = new Poller(catalog, watchlist, webhooks, deliveryQueue, config.pollIntervalSeconds * 1000);
  poller.start();

  const deliveryWorker = new DeliveryWorker(db, deliveryQueue, 15000);
  deliveryWorker.start();

  const app = buildServer({ catalog, watchlist, webhooks, pricing });
  await app.listen({ port: config.port, host: "0.0.0.0" });

  const shutdown = async () => {
    poller.stop();
    deliveryWorker.stop();
    await app.close();
    db.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
