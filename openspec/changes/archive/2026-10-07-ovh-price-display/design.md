# Design

## Context

See proposal.md for motivation. Confirmed by direct fetch during planning: OVH's public order-catalog API (`GET https://api.ovh.com/v1/order/catalog/public/{catalogName}?ovhSubsidiary={code}`, same shape on `api.us.ovhcloud.com` for the US region) exposes `baremetalServers` and `eco` catalogs, each returning `{ locale: { currencyCode }, plans: [...], addons: [...] }`. A plan has `planCode`, `addonFamilies` (each an exclusive/mandatory group like `memory`, `storage`, `system-storage`, with a list of valid addon codes and a `default`), and `pricings` (one-time + recurring entries). An addon has its own `planCode` (its addon code) and its own `pricings`. Matched empirically against the live EU (GBP) and US (USD) availability data: ~98-100% of entries can be matched to a specific priced addon per family; a small fraction (unknown plan codes, naming mismatches like `noraid-0` vs `softraid-0disk`, genuinely ambiguous storage codes) cannot and must fall back to "no price" rather than a wrong number.

## Goals / Non-Goals

**Goals:**
- Show a real monthly price (not a generic "starting at") for the exact row displayed, in the correct regional currency (GBP for EU, USD for US).
- Degrade gracefully: pricing fetch failures or unmatched entries never break availability display.

**Non-Goals:**
- Exact price for every single row (addon-naming edge cases make ~1-2% unmatchable; those show "price unavailable").
- Commitment/contract pricing (12/24-month upfront plans) or one-time setup fees - only the no-commitment monthly recurring price.
- Historical price tracking or price-change webhooks (only availability transitions trigger webhooks, per the original change).

## Decisions

### Separate `PricingService`, not folded into `CatalogService`
- **Why**: different cache lifetime (hours, not 30s) and different upstream (order-catalog, not availability). Keeping them separate means a pricing fetch failure/slowness can't affect the fast availability poll path.
- **Cache TTL**: configurable via `PRICE_CACHE_SECONDS` (default 21600 = 6h). Same tolerant-degradation pattern as `CatalogService`: on fetch failure, keep serving the last good data for that region and mark it degraded.

### Addon matching algorithm
For a given matched plan and a field value (e.g. `entry.storage = "hardraid-12x3840sas"`), find candidates in the relevant `addonFamilies` entry's `addons` list where `addonCode.startsWith(fieldValue + "-")`. Empirically this is necessary (not just an exact-string-concat guess) because addon codes are suffixed with a catalog-internal plan identifier that can differ from the availability API's `planCode` for region-variant plans (e.g. availability planCode `23scaleamd01-v3-mum` vs its addons' own suffix `23scaleamd01-v3`). When more than one candidate matches the prefix (rare - observed with multi-attribute storage names, e.g. `hardraid-24x22000-hdd-sas` matching several NVMe-cache variants), pick the shortest matching code; if that still leaves more than one, treat it as unmatched (see spec's "Ambiguous addon match" scenario) rather than guess.

### Monthly price selection
Within a plan's or addon's `pricings` array, select the entry where `capacities` includes `renew`, `interval === 1`, `intervalUnit === "month"`, `commitment === 0`, `mode === "default"` - the plain month-to-month recurring price, excluding one-time installation fees and 12/24-month upfront commitment pricing. Sum: `planMonthlyPrice + memoryAddonMonthlyPrice + storageAddonMonthlyPrice + systemStorageAddonMonthlyPrice` (each addon's own monthly price is already a delta - 0 for the plan's default addon, non-zero for an upgrade, confirmed empirically). Format with `Intl.NumberFormat(undefined, { style: "currency", currency })` using the region's `currencyCode` from the catalog's `locale`.

### Where enrichment happens
`server.ts`'s `GET /api/catalog` handler fetches availability entries (as today) and, after filtering, maps each entry through `pricingService.priceFor(region, entry)` to attach `price: { amount, currency, formatted } | null`. This keeps `catalog.ts` (availability normalization) and `pricing.ts` (pricing lookup) independent modules joined only at the API layer.

## Risks / Trade-offs

- [Pricing catalogs are large (~10-35MB each, 4 fetches)] → Mitigated by the long cache TTL; accepted as a one-time cost every few hours rather than optimizing payload size, since this is a single-user tool.
- [OVH could change order-catalog shape or addon-naming conventions without notice] → Same class of risk as the availability endpoint (undocumented API); mitigated by graceful per-entry fallback to "no price" instead of a crash or a wrong number.
- [GBP/USD only, no other subsidiaries] → Explicit user choice (not configurable yet); revisit if multi-currency becomes a real need.

## Migration Plan

Additive only - no schema or breaking API changes; `price` is a new optional field on catalog entries. No rollback concerns beyond reverting the deploy.
