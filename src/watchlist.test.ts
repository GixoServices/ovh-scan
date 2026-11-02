import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDatabase } from "./db.js";
import { WatchlistStore } from "./watchlist.js";

function makeEntry(overrides: Partial<Parameters<WatchlistStore["add"]>[0]> = {}) {
  return {
    region: "eu" as const,
    planCode: "plan-a",
    datacenter: "rbx",
    fqn: "plan-a.fqn",
    server: "srv-a",
    ...overrides,
  };
}

test("add() dedupes on (region, fqn, datacenter)", () => {
  const db = openDatabase(":memory:");
  const store = new WatchlistStore(db);
  const first = store.add(makeEntry());
  const second = store.add(makeEntry());
  assert.equal(first.id, second.id);
  assert.equal(store.list().length, 1);
});

test("add() keeps two distinct memory/storage variants at the same plan code and datacenter as separate rows", () => {
  const db = openDatabase(":memory:");
  const store = new WatchlistStore(db);
  const a = store.add(makeEntry({ fqn: "plan-a.ram-32g.storage-x" }));
  const b = store.add(makeEntry({ fqn: "plan-a.ram-32g.storage-y" }));
  assert.notEqual(a.id, b.id);
  assert.equal(store.list().length, 2);
});

test("remove() deletes a watched entry", () => {
  const db = openDatabase(":memory:");
  const store = new WatchlistStore(db);
  const entry = store.add(makeEntry());
  assert.equal(store.remove(entry.id), true);
  assert.equal(store.list().length, 0);
});

test("remove() on unknown id returns false", () => {
  const db = openDatabase(":memory:");
  const store = new WatchlistStore(db);
  assert.equal(store.remove(999), false);
});

test("updateStatus() persists last_status and last_checked_at", () => {
  const db = openDatabase(":memory:");
  const store = new WatchlistStore(db);
  const entry = store.add(makeEntry());
  store.updateStatus(entry.id, "available", "2026-01-01T00:00:00.000Z");
  const [updated] = store.list();
  assert.equal(updated.lastStatus, "available");
  assert.equal(updated.lastCheckedAt, "2026-01-01T00:00:00.000Z");
});

test("watchlist persists across a process restart (reopening the same file)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ovh-watchlist-test-"));
  const file = path.join(dir, "data.db");
  try {
    const db1 = openDatabase(file);
    const store1 = new WatchlistStore(db1);
    const entry = store1.add(makeEntry());
    store1.updateStatus(entry.id, "available", "2026-01-01T00:00:00.000Z");
    db1.close();

    const db2 = openDatabase(file);
    const store2 = new WatchlistStore(db2);
    const [reloaded] = store2.list();
    assert.equal(reloaded.planCode, "plan-a");
    assert.equal(reloaded.lastStatus, "available");
    db2.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
