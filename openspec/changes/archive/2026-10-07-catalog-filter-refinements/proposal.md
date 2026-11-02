# Proposal

## Why

The current memory and storage filters require an exact match against OVH's raw facet strings (e.g. `ram-32g-ecc-2400`, `softraid-2x960nvme`). That's unusable for the common case: "show me 32GB or 64GB configs with NVMe storage" would otherwise mean hunting down and checking every ECC/speed variant of 32GB and every NVMe disk-count/size variant - a real request from using the page.

## What Changes

- Memory filter becomes a multi-select of parsed GB sizes (e.g. `32`, `64`), extracted from the raw memory string, with OR semantics across selected sizes (matches the existing datacenter multi-select pattern).
- Storage filter becomes a free-text, case-insensitive substring match (e.g. typing `nvme` matches `softraid-2x960nvme`, `hybridsoftraid-4x2000sa-2x240ssd`'s nvme variants, etc.) instead of requiring one exact storage code.
- Filter facets expose distinct memory sizes (parsed, sorted numerically) instead of raw memory strings, so the UI can render simple size checkboxes.

## Capabilities

### Modified Capabilities
- `server-catalog`: the "Filter the catalog along multiple dimensions" and "Expose filter facets" requirements change - memory becomes a multi-select of parsed sizes (OR semantics) and storage becomes a substring match, instead of both being exact-value matches.

## Impact

- `GET /api/catalog` query params: `memory` changes from a single exact string to a comma-separated list of GB sizes (e.g. `memory=32,64`); `storage` changes from exact match to substring match (no shape change, just matching semantics).
- `GET /api/catalog/facets` response: `memory` facet changes from raw strings to a sorted array of numbers; `storage` facet is no longer needed for the UI (free text replaces it) but can stay for reference.
- Frontend: memory dropdown becomes a checkbox list (like datacenters); storage dropdown becomes a text input.
