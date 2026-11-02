import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "./db.js";
import {
  WebhookStore,
  DeliveryQueue,
  isValidWebhookUrl,
  backoffSeconds,
  signPayload,
  deliverOne,
  sendTestWebhook,
} from "./webhooks.js";

test("isValidWebhookUrl accepts http(s) and rejects everything else", () => {
  assert.equal(isValidWebhookUrl("https://example.com/hook"), true);
  assert.equal(isValidWebhookUrl("http://example.com/hook"), true);
  assert.equal(isValidWebhookUrl("ftp://example.com/hook"), false);
  assert.equal(isValidWebhookUrl("not a url"), false);
});

test("WebhookStore.add rejects a malformed URL", () => {
  const db = openDatabase(":memory:");
  const store = new WebhookStore(db);
  assert.throws(() => store.add("not a url", null));
});

test("WebhookStore.getById returns the webhook with its secret, or undefined", () => {
  const db = openDatabase(":memory:");
  const store = new WebhookStore(db);
  const created = store.add("https://example.com/hook", "shh");
  const found = store.getById(created.id);
  assert.ok(found);
  assert.equal(found!.url, "https://example.com/hook");
  assert.equal(found!.secret, "shh");
  assert.equal(store.getById(999999), undefined);
});

test("sendTestWebhook reports success with the HTTP status", async () => {
  const okFetch = (async () => ({ ok: true, status: 200 }) as unknown as Response) as typeof fetch;
  const result = await sendTestWebhook({ url: "https://example.com/hook", secret: null }, okFetch);
  assert.equal(result.ok, true);
  assert.equal(result.statusCode, 200);
});

test("sendTestWebhook reports failure on a non-2xx response without touching any delivery queue", async () => {
  const badFetch = (async () => ({ ok: false, status: 503 }) as unknown as Response) as typeof fetch;
  const result = await sendTestWebhook({ url: "https://example.com/hook", secret: null }, badFetch);
  assert.equal(result.ok, false);
  assert.equal(result.statusCode, 503);
});

test("sendTestWebhook reports failure on a network error", async () => {
  const throwingFetch = (async () => {
    throw new Error("connection refused");
  }) as typeof fetch;
  const result = await sendTestWebhook({ url: "https://example.com/hook", secret: null }, throwingFetch);
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /connection refused/);
});

test("sendTestWebhook signs the payload when a secret is configured", async () => {
  let capturedHeaders: Record<string, string> | undefined;
  const fetchSpy = (async (_url: unknown, init: any) => {
    capturedHeaders = init.headers;
    return { ok: true, status: 200 } as unknown as Response;
  }) as typeof fetch;
  await sendTestWebhook({ url: "https://example.com/hook", secret: "shh" }, fetchSpy);
  assert.ok(capturedHeaders?.["x-signature"]);
});

test("backoffSeconds increases with attempt number and is capped", () => {
  const seq = [1, 2, 3, 4, 5, 6].map(backoffSeconds);
  assert.deepEqual(seq, [60, 120, 240, 480, 960, 960]);
});

test("signPayload produces a stable HMAC-SHA256 hex digest", () => {
  const sig1 = signPayload("secret", '{"a":1}');
  const sig2 = signPayload("secret", '{"a":1}');
  const sig3 = signPayload("other-secret", '{"a":1}');
  assert.equal(sig1, sig2);
  assert.notEqual(sig1, sig3);
  assert.match(sig1, /^[0-9a-f]{64}$/);
});

test("two events for the same destination enqueue independent delivery rows", () => {
  const db = openDatabase(":memory:");
  const webhooks = new WebhookStore(db);
  const hook = webhooks.add("https://example.com/hook", null);
  const queue = new DeliveryQueue(db, 5);

  queue.enqueue(1, "watch-1:t1", { a: 1 }, [{ id: hook.id }]);
  queue.enqueue(2, "watch-2:t1", { a: 2 }, [{ id: hook.id }]);

  assert.equal(queue.dueDeliveries().length, 2);
});

test("enqueue is idempotent per (webhook, event_key)", () => {
  const db = openDatabase(":memory:");
  const webhooks = new WebhookStore(db);
  const hook = webhooks.add("https://example.com/hook", null);
  const queue = new DeliveryQueue(db, 5);

  queue.enqueue(1, "watch-1:t1", { a: 1 }, [{ id: hook.id }]);
  queue.enqueue(1, "watch-1:t1", { a: 1 }, [{ id: hook.id }]);

  assert.equal(queue.dueDeliveries().length, 1);
});

test("deliverOne retries on failure and eventually marks failed after max attempts", async () => {
  const db = openDatabase(":memory:");
  const webhooks = new WebhookStore(db);
  const hook = webhooks.add("https://example.com/hook", null);
  const queue = new DeliveryQueue(db, 2);
  queue.enqueue(1, "watch-1:t1", { a: 1 }, [{ id: hook.id }]);

  const failingFetch = (async () => {
    throw new Error("network error");
  }) as typeof fetch;

  let [row] = queue.dueDeliveries();
  await deliverOne(row, { url: hook.url, secret: null }, queue, failingFetch);
  [row] = db.prepare("SELECT * FROM webhook_deliveries WHERE id = ?").all(row.id) as any;
  assert.equal(row.status, "pending");
  assert.equal(row.attempt_count, 1);

  // Force the retry to be due immediately for the test.
  db.prepare("UPDATE webhook_deliveries SET next_attempt_at = ? WHERE id = ?").run(
    new Date(0).toISOString(),
    row.id,
  );
  [row] = queue.dueDeliveries();
  await deliverOne(row, { url: hook.url, secret: null }, queue, failingFetch);
  [row] = db.prepare("SELECT * FROM webhook_deliveries WHERE id = ?").all(row.id) as any;
  assert.equal(row.status, "failed");
  assert.equal(row.attempt_count, 2);
});

test("deliverOne recovers mid-retry when the destination comes back", async () => {
  const db = openDatabase(":memory:");
  const webhooks = new WebhookStore(db);
  const hook = webhooks.add("https://example.com/hook", null);
  const queue = new DeliveryQueue(db, 5);
  queue.enqueue(1, "watch-1:t1", { a: 1 }, [{ id: hook.id }]);

  let attempt = 0;
  const flakyFetch = (async () => {
    attempt += 1;
    if (attempt === 1) throw new Error("network error");
    return { ok: true, status: 200 } as unknown as Response;
  }) as typeof fetch;

  let [row] = queue.dueDeliveries();
  await deliverOne(row, { url: hook.url, secret: null }, queue, flakyFetch);
  [row] = db.prepare("SELECT * FROM webhook_deliveries WHERE id = ?").all(row.id) as any;
  assert.equal(row.status, "pending");
  assert.equal(row.attempt_count, 1);

  db.prepare("UPDATE webhook_deliveries SET next_attempt_at = ? WHERE id = ?").run(
    new Date(0).toISOString(),
    row.id,
  );
  [row] = queue.dueDeliveries();
  await deliverOne(row, { url: hook.url, secret: null }, queue, flakyFetch);
  [row] = db.prepare("SELECT * FROM webhook_deliveries WHERE id = ?").all(row.id) as any;
  assert.equal(row.status, "delivered");
});

test("deliverOne marks delivered on success and signs the payload when a secret is set", async () => {
  const db = openDatabase(":memory:");
  const webhooks = new WebhookStore(db);
  const hook = webhooks.add("https://example.com/hook", "shh");
  const queue = new DeliveryQueue(db, 5);
  queue.enqueue(1, "watch-1:t1", { a: 1 }, [{ id: hook.id }]);

  let capturedHeaders: Record<string, string> | undefined;
  const okFetch = (async (_url: unknown, init: any) => {
    capturedHeaders = init.headers;
    return { ok: true, status: 200 } as unknown as Response;
  }) as typeof fetch;

  const [row] = queue.dueDeliveries();
  await deliverOne(row, { url: hook.url, secret: "shh" }, queue, okFetch);

  const [updated] = db.prepare("SELECT * FROM webhook_deliveries WHERE id = ?").all(row.id) as any;
  assert.equal(updated.status, "delivered");
  assert.ok(capturedHeaders?.["x-signature"]);
});
