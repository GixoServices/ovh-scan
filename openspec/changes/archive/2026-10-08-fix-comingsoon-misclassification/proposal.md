# Proposal

## Why

User screenshots showed `25skle042-us` at `hil` with raw availability `comingSoon` rendered with a green "available"-style badge in the catalog, and the same row's watchlist entry showing status `available` - inconsistent with what "coming soon" actually means (not yet orderable). Root cause confirmed by fetching the live OVH feeds directly: `classify()` uses a denylist of exactly two strings (`unavailable`, `unknown`) and treats *everything else* as available. The real feeds currently include `comingSoon` (explicitly "not yet available") alongside genuine lead-time codes (`1H-high`, `1H-low`, `72H`, `720H`, `1440H`). `comingSoon` was being misclassified as available, which could also have fired a false "became available" webhook for anyone watching it.

## What Changes

- Replace the denylist classification with an explicit allowlist: a raw code is "available" only if it matches a recognized lead-time pattern (`<digits>H` optionally suffixed `-high`/`-low`, e.g. `1H-high`, `72H`, `1440H`). Everything else - `unavailable`, `unknown`, `comingSoon`, and any future/unrecognized code OVH introduces - classifies as "not available", erring conservatively rather than risking a false-positive webhook on a status we don't understand.

## Capabilities

### Modified Capabilities
- `server-catalog`: the "Classify availability codes" requirement's rule changes from a denylist to an allowlist.

## Impact

- `src/catalog.ts` (`classify()`) only.
- Self-healing for already-affected watchlist rows: the catalog's live classification (used for display) is always computed fresh per request, so it corrects immediately on deploy; the *persisted* watchlist `last_status` for anything currently misclassified corrects itself on the next poll cycle (no migration needed - it's a reclassification, not a data change).
