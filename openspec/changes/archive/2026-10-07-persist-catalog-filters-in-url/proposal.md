# Proposal

## Why

User report: "when i refresh the page al disappear". Verified the backend is fine (watchlist/webhooks/catalog all persist and return data correctly after a reload). The actual cause: the catalog filter selections (search text, region, availability, datacenter checkboxes, memory-size checkboxes, storage text) only live in in-page JS state, nothing in the URL or storage. A normal browser refresh re-runs the page from scratch with default filters, so any narrowed-down view the user built up (e.g. "32GB or 64GB + nvme") reverts to the default "available only, no other filters" view - which, compared to what they were looking at, looks like everything "disappeared".

## What Changes

- Reflect the current catalog filter selections in the page's URL query string as they change.
- On page load, restore filter selections (and pre-check the relevant checkboxes) from the URL query string before the first catalog fetch, instead of always starting from hard-coded defaults.

## Capabilities

### New Capabilities
- `web-ui`: frontend-only behavior requirements for the single-page catalog/watchlist/webhook UI (first capability covering the page itself, previously only covered implicitly by `server-catalog`'s filtering API).

## Impact

- `public/app.js` only - no backend/API changes (the existing `/api/catalog` query params are reused as the URL's query string, so no new parsing needed server-side).
- A side benefit: filtered views become shareable/bookmarkable links.
