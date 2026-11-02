# Tasks

## 1. Backend

- [x] 1.1 Add a `parseMemorySizeGb(memory)` helper that extracts the GB number from a raw memory string (e.g. `ram-32g-ecc-2400` -> `32`); verify with unit tests covering several real memory string formats and an unparseable fallback (`null`)
- [x] 1.2 Change `CatalogFilters.memory` from a single exact-match string to `memorySizes?: number[]` with OR semantics (entry matches if its parsed size is in the set); verify with unit tests for single size, multiple sizes, and no match
- [x] 1.3 Change `CatalogFilters.storage` from exact match to a case-insensitive substring match against the raw storage string; verify with unit tests including mixed-case input
- [x] 1.4 Update `computeFacets` to return sorted numeric memory sizes instead of raw memory strings; verify with a unit test
- [x] 1.5 Update the `/api/catalog` route to parse `memory` as a comma-separated list of numbers into `memorySizes`, and pass `storage` straight through as the substring filter; verify with an integration test combining both filters

## 2. Frontend

- [x] 2.1 Replace the memory `<select>` with a checkbox list (same pattern as the existing datacenter multi-select), populated from `/api/catalog/facets`' numeric sizes, OR'd together
- [x] 2.2 Replace the storage `<select>` with a text input that free-types a substring (e.g. "nvme"), debounced like the existing search box
- [x] 2.3 Verify manually: selecting memory sizes 32 and 64 together with a storage filter of "nvme" narrows the table to matching rows only, and clearing filters restores the full list
