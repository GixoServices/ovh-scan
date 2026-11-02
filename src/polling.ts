import type { CatalogService, NormalizedEntry } from "./catalog.js";
import type { WatchlistStore } from "./watchlist.js";
import type { DeliveryQueue, WebhookStore } from "./webhooks.js";

export class Poller {
  private running = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly catalog: CatalogService,
    private readonly watchlist: WatchlistStore,
    private readonly webhookStore: WebhookStore,
    private readonly deliveryQueue: DeliveryQueue,
    private readonly intervalMs: number,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const watched = this.watchlist.list();
      if (watched.length === 0) return;

      const { entries, degradedRegions } = await this.catalog.getCatalog();
      const degraded = new Set(degradedRegions);
      const index = new Map<string, NormalizedEntry>();
      for (const entry of entries) {
        index.set(`${entry.region}:${entry.fqn}:${entry.datacenter}`, entry);
      }

      const checkedAt = new Date().toISOString();
      const activeWebhooks = this.webhookStore.listActiveWithSecret();

      for (const watch of watched) {
        if (degraded.has(watch.region)) continue;

        const key = `${watch.region}:${watch.fqn}:${watch.datacenter}`;
        const entry = index.get(key);
        if (!entry) continue;

        const becameAvailable = watch.lastStatus !== "available" && entry.classification === "available";
        this.watchlist.updateStatus(watch.id, entry.classification, checkedAt);

        if (becameAvailable && activeWebhooks.length > 0) {
          const eventKey = `${watch.id}:${checkedAt}`;
          const payload = {
            region: watch.region,
            planCode: watch.planCode,
            datacenter: watch.datacenter,
            fqn: watch.fqn,
            server: watch.server,
            rawAvailability: entry.rawAvailability,
            detectedAt: checkedAt,
          };
          this.deliveryQueue.enqueue(watch.id, eventKey, payload, activeWebhooks);
        }
      }
    } finally {
      this.running = false;
    }
  }
}
