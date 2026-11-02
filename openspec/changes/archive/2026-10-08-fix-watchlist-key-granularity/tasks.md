# Tasks

## 1. Database Migration

- [x] 1.1 Add a `schema_meta` table and a schema-version-gated migration in `src/db.ts`: when the existing `watchlist` table still has the old `UNIQUE (region, plan_code, datacenter)` constraint, rename it, recreate it with `UNIQUE (region, fqn, datacenter)`, copy all rows across (preserving `id`), and drop the old table; verify with a unit test that seeds a v1-schema SQLite file, opens it through the migration, and confirms existing rows survive with their original ids/data intact
- [x] 1.2 Verify the migration is a no-op (and doesn't error) on a fresh database that already has the new schema, and on a second run against an already-migrated database

## 2. Backend Key Fix

- [x] 2.1 Change `WatchlistStore.add()`'s dedup lookup/insert from `(region, plan_code, datacenter)` to `(region, fqn, datacenter)`; verify with unit tests: adding two different fqn variants at the same plan code + datacenter creates two rows, re-adding the same fqn+datacenter dedupes as before
- [x] 2.2 Change the poller's catalog-index key and watch-lookup key in `src/polling.ts` from `region:planCode:datacenter` to `region:fqn:datacenter`; verify with a unit test that two catalog entries sharing a plan code and datacenter but different fqn are tracked and transition-detected independently

## 3. Frontend Key Fix

- [x] 3.1 Change `isWatched()` in `public/app.js` to compare `(region, fqn, datacenter)` instead of `(region, planCode, datacenter)`
- [x] 3.2 Verify manually against the live app: watch one memory/storage variant of a plan code at a given datacenter, confirm only that exact row shows "Watching" and a different variant at the same plan code + datacenter still shows "Watch"

## 4. Deployment Verification

- [x] 4.1 Rebuild and restart the running Docker Compose stack; verify the existing (real) watchlist data from before this fix is still present and correctly keyed after the migration runs
