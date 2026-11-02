import crypto from "node:crypto";
import type { AppDatabase } from "./db.js";

export interface WebhookDestination {
  id: number;
  url: string;
  hasSecret: boolean;
  active: boolean;
  createdAt: string;
}

interface WebhookRow {
  id: number;
  url: string;
  secret: string | null;
  active: number;
  created_at: string;
}

function toDestination(row: WebhookRow): WebhookDestination {
  return {
    id: row.id,
    url: row.url,
    hasSecret: Boolean(row.secret),
    active: row.active === 1,
    createdAt: row.created_at,
  };
}

export function isValidWebhookUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export class WebhookStore {
  constructor(private readonly db: AppDatabase) {}

  list(): WebhookDestination[] {
    const rows = this.db
      .prepare("SELECT * FROM webhooks ORDER BY created_at ASC")
      .all() as unknown as WebhookRow[];
    return rows.map(toDestination);
  }

  listActiveWithSecret(): Array<{ id: number; url: string; secret: string | null }> {
    const rows = this.db
      .prepare("SELECT id, url, secret FROM webhooks WHERE active = 1")
      .all() as Array<{ id: number; url: string; secret: string | null }>;
    return rows;
  }

  add(url: string, secret: string | null): WebhookDestination {
    if (!isValidWebhookUrl(url)) {
      throw new Error("Webhook URL must be a well-formed http(s):// URL");
    }
    const createdAt = new Date().toISOString();
    const info = this.db
      .prepare("INSERT INTO webhooks (url, secret, active, created_at) VALUES (?, ?, 1, ?)")
      .run(url, secret, createdAt);
    const row = this.db
      .prepare("SELECT * FROM webhooks WHERE id = ?")
      .get(info.lastInsertRowid) as unknown as WebhookRow;
    return toDestination(row);
  }

  remove(id: number): boolean {
    const info = this.db.prepare("DELETE FROM webhooks WHERE id = ?").run(id);
    return info.changes > 0;
  }

  getById(id: number): { id: number; url: string; secret: string | null; active: boolean } | undefined {
    const row = this.db.prepare("SELECT * FROM webhooks WHERE id = ?").get(id) as unknown as WebhookRow | undefined;
    return row ? { id: row.id, url: row.url, secret: row.secret, active: row.active === 1 } : undefined;
  }
}

export interface DeliveryRow {
  id: number;
  watch_id: number;
  webhook_id: number;
  event_key: string;
  payload: string;
  attempt_count: number;
  status: string;
  next_attempt_at: string;
  last_error: string | null;
  created_at: string;
}

const BACKOFF_SECONDS = [60, 120, 240, 480, 960];

export function backoffSeconds(attemptNumber: number): number {
  const index = Math.min(attemptNumber - 1, BACKOFF_SECONDS.length - 1);
  return BACKOFF_SECONDS[Math.max(index, 0)];
}

export function signPayload(secret: string, body: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

export class DeliveryQueue {
  constructor(
    private readonly db: AppDatabase,
    private readonly maxAttempts: number,
  ) {}

  enqueue(watchId: number, eventKey: string, payload: unknown, destinations: Array<{ id: number }>): void {
    const body = JSON.stringify(payload);
    const now = new Date().toISOString();
    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO webhook_deliveries
         (watch_id, webhook_id, event_key, payload, attempt_count, status, next_attempt_at, created_at)
       VALUES (?, ?, ?, ?, 0, 'pending', ?, ?)`,
    );
    for (const dest of destinations) {
      insert.run(watchId, dest.id, eventKey, body, now, now);
    }
  }

  dueDeliveries(limit = 50): DeliveryRow[] {
    const now = new Date().toISOString();
    return this.db
      .prepare(
        `SELECT * FROM webhook_deliveries
         WHERE status = 'pending' AND next_attempt_at <= ?
         ORDER BY next_attempt_at ASC LIMIT ?`,
      )
      .all(now, limit) as unknown as DeliveryRow[];
  }

  markDelivered(id: number): void {
    this.db.prepare("UPDATE webhook_deliveries SET status = 'delivered' WHERE id = ?").run(id);
  }

  markFailedAttempt(id: number, attemptCount: number, error: string): void {
    if (attemptCount >= this.maxAttempts) {
      this.db
        .prepare(
          "UPDATE webhook_deliveries SET attempt_count = ?, status = 'failed', last_error = ? WHERE id = ?",
        )
        .run(attemptCount, error, id);
      return;
    }
    const nextAttemptAt = new Date(Date.now() + backoffSeconds(attemptCount) * 1000).toISOString();
    this.db
      .prepare(
        `UPDATE webhook_deliveries
         SET attempt_count = ?, next_attempt_at = ?, last_error = ?
         WHERE id = ?`,
      )
      .run(attemptCount, nextAttemptAt, error, id);
  }
}

export interface SignedPostResult {
  ok: boolean;
  statusCode?: number;
  error?: string;
}

export async function postSignedWebhook(
  url: string,
  secret: string | null,
  payload: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 10000,
): Promise<SignedPostResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (secret) headers["x-signature"] = signPayload(secret, payload);
    const res = await fetchImpl(url, { method: "POST", headers, body: payload, signal: controller.signal });
    if (!res.ok) {
      return { ok: false, statusCode: res.status, error: `destination responded with HTTP ${res.status}` };
    }
    return { ok: true, statusCode: res.status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

export async function deliverOne(
  row: DeliveryRow,
  webhook: { url: string; secret: string | null },
  queue: DeliveryQueue,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 10000,
): Promise<void> {
  const result = await postSignedWebhook(webhook.url, webhook.secret, row.payload, fetchImpl, timeoutMs);
  if (result.ok) {
    queue.markDelivered(row.id);
  } else {
    queue.markFailedAttempt(row.id, row.attempt_count + 1, result.error ?? "unknown error");
  }
}

export async function sendTestWebhook(
  webhook: { url: string; secret: string | null },
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 10000,
): Promise<SignedPostResult> {
  const payload = JSON.stringify({
    test: true,
    message: "Test delivery from OVH Availability Tracker",
    sentAt: new Date().toISOString(),
  });
  return postSignedWebhook(webhook.url, webhook.secret, payload, fetchImpl, timeoutMs);
}
