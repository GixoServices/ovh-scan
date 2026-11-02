# Proposal

## Why

The EU availability and pricing fetches use `api.ovh.com`, OVH's legacy/original API domain. The user pointed out `api.us.ovhcloud.com` (used for the US region) has an EU counterpart, `api.eu.ovhcloud.com`, following the same regional naming convention. Verified both domains are mirrors of the same backend (byte-identical availability payload, same order-catalog pricing response), so this is a pure consistency change with no behavior difference.

## What Changes

- Switch the EU region's availability endpoint from `https://api.ovh.com/v1/dedicated/server/datacenter/availabilities` to `https://api.eu.ovhcloud.com/v1/dedicated/server/datacenter/availabilities`.
- Switch the EU region's order-catalog pricing base URL from `https://api.ovh.com` to `https://api.eu.ovhcloud.com`.

## Capabilities

### Modified Capabilities
- `server-catalog`: the "Fetch availability from both regions" requirement names the new EU endpoint. (`pricing`'s spec doesn't name a literal domain, only subsidiary codes, so it needs no spec delta - just the code change noted under Impact.)

## Impact

- Code: `src/catalog.ts` (`REGION_ENDPOINTS.eu`), `src/pricing.ts` (`REGION_CATALOG_CONFIG.eu.base`).
- No data/behavior change (confirmed identical responses); existing tests only assert on the US domain string, so no test changes needed.
