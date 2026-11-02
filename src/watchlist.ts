import type { AppDatabase } from "./db.js";
import type { Classification, Region } from "./catalog.js";

export interface WatchlistEntry {
  id: number;
  region: Region;
  planCode: string;
  datacenter: string;
  fqn: string;
  server: string;
  lastStatus: Classification | null;
  lastCheckedAt: string | null;
  createdAt: string;
}

interface WatchlistRow {
  id: number;
  region: string;
  plan_code: string;
  datacenter: string;
  fqn: string;
  server: string;
  last_status: string | null;
  last_checked_at: string | null;
  created_at: string;
}

function toEntry(row: WatchlistRow): WatchlistEntry {
  return {
    id: row.id,
    region: row.region as Region,
    planCode: row.plan_code,
    datacenter: row.datacenter,
    fqn: row.fqn,
    server: row.server,
    lastStatus: row.last_status as Classification | null,
    lastCheckedAt: row.last_checked_at,
    createdAt: row.created_at,
  };
}

export class WatchlistStore {
  constructor(private readonly db: AppDatabase) {}

  list(): WatchlistEntry[] {
    const rows = this.db
      .prepare("SELECT * FROM watchlist ORDER BY created_at ASC")
      .all() as unknown as WatchlistRow[];
    return rows.map(toEntry);
  }

  add(input: { region: Region; planCode: string; datacenter: string; fqn: string; server: string }): WatchlistEntry {
    const existing = this.db
      .prepare("SELECT * FROM watchlist WHERE region = ? AND fqn = ? AND datacenter = ?")
      .get(input.region, input.fqn, input.datacenter) as unknown as WatchlistRow | undefined;
    if (existing) return toEntry(existing);

    const createdAt = new Date().toISOString();
    const info = this.db
      .prepare(
        `INSERT INTO watchlist (region, plan_code, datacenter, fqn, server, last_status, last_checked_at, created_at)
         VALUES (?, ?, ?, ?, ?, NULL, NULL, ?)`,
      )
      .run(input.region, input.planCode, input.datacenter, input.fqn, input.server, createdAt);

    const row = this.db
      .prepare("SELECT * FROM watchlist WHERE id = ?")
      .get(info.lastInsertRowid) as unknown as WatchlistRow;
    return toEntry(row);
  }

  remove(id: number): boolean {
    const info = this.db.prepare("DELETE FROM watchlist WHERE id = ?").run(id);
    return info.changes > 0;
  }

  updateStatus(id: number, status: Classification, checkedAt: string): void {
    this.db
      .prepare("UPDATE watchlist SET last_status = ?, last_checked_at = ? WHERE id = ?")
      .run(status, checkedAt, id);
  }
}
