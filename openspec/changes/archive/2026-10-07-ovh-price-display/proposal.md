# Proposal

## Why

The catalog table shows stock availability but not cost, so a user can't judge whether a now-available server is worth watching without leaving the app to check OVH's pricing pages. OVH's public order-catalog API lets us compute a real monthly price for the exact memory/storage/datacenter configuration shown in each row.

## What Changes

- Fetch OVH's public order-catalog pricing data (`baremetalServers` and `eco` catalogs) for both regions: EU priced in GBP (`ovhSubsidiary=GB`), US priced in USD (`ovhSubsidiary=US`).
- Match each catalog row's `(planCode, memory, storage, systemStorage)` to a priced configuration: base plan monthly price + any addon price delta for the specific memory/storage/system-storage selected (not just the plan's default configuration).
- Display the computed monthly price (formatted with the correct currency) in the catalog table; show "price unavailable" for the small fraction of rows that can't be matched (unmatched plan code, ambiguous addon match, or no monthly-recurring pricing entry).
- Cache the pricing catalogs separately from availability data, with a much longer TTL (price data is tens of megabytes per catalog and changes far less often than stock).

## Capabilities

### New Capabilities
- `pricing`: fetch/cache OVH's public order-catalog pricing data and compute a monthly price for a given catalog entry.

### Modified Capabilities
- `server-catalog`: catalog entries returned to the UI now include an optional computed price alongside availability.

## Impact

- New outbound dependency: OVH's public, unauthenticated `/order/catalog/public/{baremetalServers|eco}` endpoints (4 large fetches: 2 catalogs x 2 regions, ~10-35MB each).
- `GET /api/catalog` response shape grows a `price` field per entry; the frontend table gains a price column.
- No new persistent storage - pricing is fetched/cached in memory like the availability catalog, just with a longer TTL.
