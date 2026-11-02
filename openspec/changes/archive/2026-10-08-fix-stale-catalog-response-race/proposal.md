# Proposal

## Why

User report with screenshot: checked the "hil" datacenter checkbox (shown correctly checked, with other filters like storage="nvme" and a memory size already active), but the table kept showing rows for every datacenter (bhs, fra, gra, lon, rbx, sbg, waw, sgp, syd, hil), not just "hil". Verified directly against the API that the backend filter itself is correct (`?datacenter=hil&...` returns exactly 7 `hil`-only rows). The bug is in the frontend: `loadCatalog()` fires a `fetch` on every filter change but has no protection against out-of-order responses - if an earlier, broader request (e.g. before the datacenter filter was narrowed) takes longer to resolve than a later, narrower one (more rows to filter/price = slower), its response can arrive *after* and silently overwrite the table, even though it's stale. The checkbox state is correct; the rendered table just reflects whichever response happened to land last, not the most recently requested one.

## What Changes

- Add a per-request sequence guard to `loadCatalog()`: tag each outgoing request with an incrementing counter, and discard any response that arrives after a newer request has already been issued, so only the result of the most recent filter state is ever rendered.

## Capabilities

### Modified Capabilities
- `web-ui`: add a requirement that the catalog table only ever reflects the most recently requested filter state, never an out-of-order stale response.

## Impact

- `public/app.js` (`loadCatalog()`) only - no backend changes (the API itself was already correct).
