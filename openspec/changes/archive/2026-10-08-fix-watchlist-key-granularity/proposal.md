# Proposal

## Why

User report with screenshot: clicking "Watch" on one specific row (planCode `24sk50-v1`, datacenter `bhs`, storage `softraid-2x450nvme`, £16.09) also showed a *different* row as "Watching" (same planCode+datacenter but storage `softraid-2x1200nvme`, £32.18) - a row the user never selected.

Root cause: a single `(planCode, datacenter)` pair can have multiple distinct catalog rows that differ only in memory/storage (confirmed directly in the screenshot: two `24sk50-v1`/`bhs` rows, two different storage configs). The watchlist's unique key, the frontend's "is this row watched" check, and the backend poller's catalog lookup all key on `(region, planCode, datacenter)` only - too coarse to tell those rows apart. This isn't just a cosmetic UI bug: the poller's catalog index (`Map` keyed the same coarse way) silently collapses multiple distinct rows onto one key, so **the backend may be polling the availability of the wrong storage/memory variant** - a real correctness bug, not just a display glitch.

## What Changes

- Re-key the watchlist, the frontend's watched/unwatched check, and the poller's catalog lookup from `(region, planCode, datacenter)` to `(region, fqn, datacenter)` - `fqn` already uniquely encodes `planCode` + `memory` + `storage` + `systemStorage`, and is already stored on every watchlist row, so no new column is needed.
- Migrate the existing SQLite `watchlist` table (already deployed, holds real user data) from its old `UNIQUE (region, plan_code, datacenter)` constraint to the new `UNIQUE (region, fqn, datacenter)`, preserving every existing row (a finer-grained constraint can never be violated by data that already satisfied the coarser one, so this is a lossless, collision-free migration).

## Capabilities

### Modified Capabilities
- `server-catalog`: "Normalize catalog entries" - the normalized record's natural key is `(region, fqn, datacenter)`, not `(region, planCode, datacenter)` (a planCode+datacenter pair can have multiple memory/storage variants).
- `watchlist-management`: "Add/Remove entries", duplicate-detection, and the Purpose statement all described the key as `(region, planCode, datacenter)` - corrected to `(region, fqn, datacenter)`.

## Impact

- `src/db.ts`: schema-version-gated migration for the existing `watchlist` table.
- `src/watchlist.ts`: dedup/lookup key.
- `src/polling.ts`: catalog-index and watch-lookup key.
- `public/app.js`: `isWatched()` key.
- Existing deployed data (the user's current watchlist) must survive the migration unchanged.
