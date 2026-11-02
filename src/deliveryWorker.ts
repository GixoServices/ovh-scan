import type { AppDatabase } from "./db.js";
import { deliverOne, DeliveryQueue } from "./webhooks.js";

interface WebhookLookupRow {
  id: number;
  url: string;
  secret: string | null;
}

export class DeliveryWorker {
  private running = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly db: AppDatabase,
    private readonly queue: DeliveryQueue,
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
      const due = this.queue.dueDeliveries();
      for (const row of due) {
        const webhook = this.db
          .prepare("SELECT id, url, secret FROM webhooks WHERE id = ?")
          .get(row.webhook_id) as WebhookLookupRow | undefined;
        if (!webhook) continue;
        await deliverOne(row, webhook, this.queue);
      }
    } finally {
      this.running = false;
    }
  }
}
