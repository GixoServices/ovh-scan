# Tasks

## 1. Frontend

- [x] 1.1 Add a module-level request sequence counter in `public/app.js`; in `loadCatalog()`, capture the counter at request start and discard the response (skip the DOM update) if a newer request has since been issued
- [x] 1.2 Verify manually: rapidly toggle multiple filters (e.g. type a search term, then immediately check a datacenter) and confirm the table always settles on the last-selected filter combination, never reverting to an earlier/broader result set
