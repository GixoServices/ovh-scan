import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "./db.js";
import { WatchlistStore } from "./watchlist.js";
import { WebhookStore, DeliveryQueue } from "./webhooks.js";
import { Poller } from "./polling.js";
import type { CatalogService, NormalizedEntry } from "./catalog.js";

function fakeCatalog(entries: NormalizedEntry[], degradedRegions: ("us" | "eu")[] = []): CatalogService {
  return {
    getCatalog: async () => ({ entries, degradedRegions }),
  } as unknown as CatalogService;
}

function entry(overrides: Partial<NormalizedEntry> = {}): NormalizedEntry {
  return {
    region: "eu",
    planCode: "plan-a",
    datacenter: "rbx",
    fqn: "plan-a.fqn",
    server: "srv-a",
    memory: null,
    storage: null,
    rawAvailability: "1H-high",
    classification: "available",
    ...overrides,
  };
}

function setup() {
  const db = openDatabase(":memory:");
  const watchlist = new WatchlistStore(db);
  const webhooks = new WebhookStore(db);
  const deliveryQueue = new DeliveryQueue(db, 5);
  return { db, watchlist, webhooks, deliveryQueue };
}

test("tick() fires a became-available event on not_available -> available", async () => {
  const { watchlist, webhooks, deliveryQueue } = setup();
  const watch = watchlist.add({ region: "eu", planCode: "plan-a", datacenter: "rbx", fqn: "plan-a.fqn", server: "s" });
  watchlist.updateStatus(watch.id, "not_available", "2026-01-01T00:00:00.000Z");
  webhooks.add("https://example.com/hook", null);

  const poller = new Poller(fakeCatalog([entry({ classification: "available" })]), watchlist, webhooks, deliveryQueue, 1000);
  await poller.tick();

  const due = deliveryQueue.dueDeliveries();
  assert.equal(due.length, 1);
  const [updated] = watchlist.list();
  assert.equal(updated.lastStatus, "available");
});

test("tick() does not re-fire when already available", async () => {
  const { watchlist, webhooks, deliveryQueue } = setup();
  const watch = watchlist.add({ region: "eu", planCode: "plan-a", datacenter: "rbx", fqn: "plan-a.fqn", server: "s" });
  watchlist.updateStatus(watch.id, "available", "2026-01-01T00:00:00.000Z");
  webhooks.add("https://example.com/hook", null);

  const poller = new Poller(fakeCatalog([entry({ classification: "available" })]), watchlist, webhooks, deliveryQueue, 1000);
  await poller.tick();

  assert.equal(deliveryQueue.dueDeliveries().length, 0);
});

test("tick() records available -> not_available without firing an event", async () => {
  const { watchlist, webhooks, deliveryQueue } = setup();
  const watch = watchlist.add({ region: "eu", planCode: "plan-a", datacenter: "rbx", fqn: "plan-a.fqn", server: "s" });
  watchlist.updateStatus(watch.id, "available", "2026-01-01T00:00:00.000Z");
  webhooks.add("https://example.com/hook", null);

  const poller = new Poller(fakeCatalog([entry({ classification: "not_available", rawAvailability: "unavailable" })]), watchlist, webhooks, deliveryQueue, 1000);
  await poller.tick();

  assert.equal(deliveryQueue.dueDeliveries().length, 0);
  const [updated] = watchlist.list();
  assert.equal(updated.lastStatus, "not_available");
});

test("tick() restores an already-available entry after restart without re-firing", async () => {
  const { watchlist, webhooks, deliveryQueue } = setup();
  // Simulate: entry was already available before a restart (persisted state).
  const watch = watchlist.add({ region: "eu", planCode: "plan-a", datacenter: "rbx", fqn: "plan-a.fqn", server: "s" });
  watchlist.updateStatus(watch.id, "available", "2025-12-31T00:00:00.000Z");
  webhooks.add("https://example.com/hook", null);

  // First poll after "restart" sees the same available state.
  const poller = new Poller(fakeCatalog([entry({ classification: "available" })]), watchlist, webhooks, deliveryQueue, 1000);
  await poller.tick();

  assert.equal(deliveryQueue.dueDeliveries().length, 0);
});

test("tick() tracks two distinct memory/storage variants at the same plan code and datacenter independently", async () => {
  const { watchlist, webhooks, deliveryQueue } = setup();
  const watchA = watchlist.add({
    region: "eu",
    planCode: "plan-a",
    datacenter: "bhs",
    fqn: "plan-a.ram-32g.storage-x",
    server: "s",
  });
  const watchB = watchlist.add({
    region: "eu",
    planCode: "plan-a",
    datacenter: "bhs",
    fqn: "plan-a.ram-32g.storage-y",
    server: "s",
  });
  watchlist.updateStatus(watchA.id, "not_available", "2026-01-01T00:00:00.000Z");
  watchlist.updateStatus(watchB.id, "not_available", "2026-01-01T00:00:00.000Z");
  webhooks.add("https://example.com/hook", null);

  const poller = new Poller(
    fakeCatalog([
      entry({ datacenter: "bhs", fqn: "plan-a.ram-32g.storage-x", classification: "available" }),
      entry({ datacenter: "bhs", fqn: "plan-a.ram-32g.storage-y", classification: "not_available", rawAvailability: "unavailable" }),
    ]),
    watchlist,
    webhooks,
    deliveryQueue,
    1000,
  );
  await poller.tick();

  const [updatedA, updatedB] = watchlist.list();
  assert.equal(updatedA.lastStatus, "available");
  assert.equal(updatedB.lastStatus, "not_available");
  assert.equal(deliveryQueue.dueDeliveries().length, 1);
});

test("tick() skips entries whose region fetch failed this cycle", async () => {
  const { watchlist, webhooks, deliveryQueue } = setup();
  const watch = watchlist.add({ region: "eu", planCode: "plan-a", datacenter: "rbx", fqn: "plan-a.fqn", server: "s" });
  watchlist.updateStatus(watch.id, "not_available", "2026-01-01T00:00:00.000Z");
  webhooks.add("https://example.com/hook", null);

  const poller = new Poller(fakeCatalog([entry({ classification: "available" })], ["eu"]), watchlist, webhooks, deliveryQueue, 1000);
  await poller.tick();

  assert.equal(deliveryQueue.dueDeliveries().length, 0);
  const [unchanged] = watchlist.list();
  assert.equal(unchanged.lastStatus, "not_available");
});
