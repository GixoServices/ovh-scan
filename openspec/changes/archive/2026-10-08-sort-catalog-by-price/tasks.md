# Tasks

## 1. Frontend

- [x] 1.1 Make the "Price / mo" table header clickable; track sort key/direction in `state.sort`, toggling asc → desc → asc on repeated clicks, with a visual indicator (▲/▼) in the header
- [x] 1.2 Apply the sort client-side in `loadCatalog()` after fetching entries: sort by `price.amount`, with entries where `price` is `null` always placed last regardless of direction
- [x] 1.3 Extend `buildQuery()`/`restoreFiltersFromUrl()`/`updateUrlFromFilters()` to include the sort key/direction, so it persists across a reload like the other filters
- [x] 1.4 Verify manually: click to sort ascending, confirm cheapest priced row is first and unpriced rows are last; click again for descending; reload and confirm the sort persists
