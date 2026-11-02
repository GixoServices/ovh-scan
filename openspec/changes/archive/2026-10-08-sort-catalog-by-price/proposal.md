# Proposal

## Why

User asked to sort the catalog table by price. With filtering already narrowing the list down, the next natural step is ranking the remaining rows cheapest/most-expensive first.

## What Changes

- Make the "Price / mo" column header clickable, toggling ascending/descending sort by the computed monthly price. Rows with no computable price (shown as "–") always sort to the end, regardless of direction.
- Sorting happens client-side over the already-fetched (filtered) entries - no backend changes, since the full filtered result set is already in the page.
- The current sort state is reflected in the URL alongside the existing filter state, so it survives a page reload (consistent with the existing filter-persistence behavior).

## Capabilities

### Modified Capabilities
- `web-ui`: add a requirement for sorting the catalog table by price.

## Impact

- `public/app.js` / `public/index.html` only - no API or data model changes.
