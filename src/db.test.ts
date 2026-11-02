import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openDatabase } from "./db.js";

function seedLegacySchemaFile(filePath: string): void {
  const db = new DatabaseSync(filePath);
  db.exec(`
    CREATE TABLE watchlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      region TEXT NOT NULL,
      plan_code TEXT NOT NULL,
      datacenter TEXT NOT NULL,
      fqn TEXT NOT NULL,
      server TEXT NOT NULL,
      last_status TEXT,
      last_checked_at TEXT,
      created_at TEXT NOT NULL,
      UNIQUE (region, plan_code, datacenter)
    );
  `);
  const insert = db.prepare(
    `INSERT INTO watchlist (region, plan_code, datacenter, fqn, server, last_status, last_checked_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  insert.run("eu", "plan-a", "bhs", "plan-a.ram-32g.storage-x", "srv-a", "available", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
  insert.run("eu", "plan-b", "rbx", "plan-b.fqn", "srv-b", null, null, "2026-01-02T00:00:00.000Z");
  db.close();
}

test("opening a legacy v1-schema database migrates the watchlist key and preserves existing rows", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ovh-db-migration-test-"));
  const file = path.join(dir, "data.db");
  try {
    seedLegacySchemaFile(file);

    const db = openDatabase(file);
    const rows = db.prepare("SELECT * FROM watchlist ORDER BY id ASC").all() as any[];
    assert.equal(rows.length, 2);
    assert.equal(rows[0].id, 1);
    assert.equal(rows[0].fqn, "plan-a.ram-32g.storage-x");
    assert.equal(rows[0].last_status, "available");
    assert.equal(rows[1].id, 2);
    assert.equal(rows[1].plan_code, "plan-b");

    const indexes = db.prepare("PRAGMA index_list(watchlist)").all() as any[];
    const uniqueCols = indexes
      .filter((i) => i.unique)
      .flatMap((i) => (db.prepare(`PRAGMA index_info(${i.name})`).all() as any[]).map((c) => c.name))
      .sort();
    assert.deepEqual(uniqueCols, ["datacenter", "fqn", "region"]);

    db.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("migration is a no-op when reopening an already-migrated database", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ovh-db-migration-test-"));
  const file = path.join(dir, "data.db");
  try {
    seedLegacySchemaFile(file);

    const db1 = openDatabase(file);
    db1.close();

    const db2 = openDatabase(file);
    const rows = db2.prepare("SELECT * FROM watchlist ORDER BY id ASC").all() as any[];
    assert.equal(rows.length, 2);
    db2.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("opening a fresh database already has the new key and does not need migration", () => {
  const db = openDatabase(":memory:");
  const indexes = db.prepare("PRAGMA index_list(watchlist)").all() as any[];
  const uniqueCols = indexes
    .filter((i) => i.unique)
    .flatMap((i) => (db.prepare(`PRAGMA index_info(${i.name})`).all() as any[]).map((c) => c.name))
    .sort();
  assert.deepEqual(uniqueCols, ["datacenter", "fqn", "region"]);
});
