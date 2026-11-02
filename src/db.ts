import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS watchlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  region TEXT NOT NULL,
  plan_code TEXT NOT NULL,
  datacenter TEXT NOT NULL,
  fqn TEXT NOT NULL,
  server TEXT NOT NULL,
  last_status TEXT,
  last_checked_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (region, fqn, datacenter)
);

CREATE TABLE IF NOT EXISTS webhooks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  secret TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  watch_id INTEGER NOT NULL,
  webhook_id INTEGER NOT NULL,
  event_key TEXT NOT NULL,
  payload TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  next_attempt_at TEXT NOT NULL,
  last_error TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (webhook_id, event_key)
);
`;

export type AppDatabase = DatabaseSync;

function hasUniqueIndexOn(db: AppDatabase, table: string, columns: string[]): boolean {
  const wanted = [...columns].sort().join(",");
  const indexes = db.prepare(`PRAGMA index_list(${table})`).all() as unknown as Array<{
    name: string;
    unique: number;
  }>;
  for (const idx of indexes) {
    if (!idx.unique) continue;
    const info = db.prepare(`PRAGMA index_info(${idx.name})`).all() as unknown as Array<{ name: string }>;
    const cols = info.map((c) => c.name).sort().join(",");
    if (cols === wanted) return true;
  }
  return false;
}

/**
 * Early versions keyed the watchlist as (region, plan_code, datacenter), which collapses
 * distinct memory/storage variants of the same plan at the same datacenter onto one row -
 * rebuilds the table on (region, fqn, datacenter) instead. A no-op once already migrated
 * (or on a fresh database, which is created with the new constraint directly).
 */
function migrateWatchlistKeyIfNeeded(db: AppDatabase): void {
  if (hasUniqueIndexOn(db, "watchlist", ["region", "fqn", "datacenter"])) return;

  db.exec(`
    ALTER TABLE watchlist RENAME TO watchlist_pre_fqn_key;
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
      UNIQUE (region, fqn, datacenter)
    );
    INSERT INTO watchlist (id, region, plan_code, datacenter, fqn, server, last_status, last_checked_at, created_at)
      SELECT id, region, plan_code, datacenter, fqn, server, last_status, last_checked_at, created_at
      FROM watchlist_pre_fqn_key;
    DROP TABLE watchlist_pre_fqn_key;
  `);
}

export function openDatabase(filePath: string): AppDatabase {
  if (filePath !== ":memory:") {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
  const db = new DatabaseSync(filePath);
  if (filePath !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL;");
  }
  db.exec(SCHEMA);
  migrateWatchlistKeyIfNeeded(db);
  return db;
}
