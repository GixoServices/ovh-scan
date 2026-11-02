# Design

## Context

Greenfield project (see proposal.md - Why). Single user, single VPS, deployed via Docker Compose. No existing code or infra to integrate with. The OVH availability endpoints are public, unauthenticated, read-only JSON arrays (~tens of thousands of entries across both regions combined) - confirmed by direct fetch during planning:

```
GET https://api.us.ovhcloud.com/v1/dedicated/server/datacenter/availabilities
GET https://api.ovh.com/v1/dedicated/server/datacenter/availabilities
```

Each entry: `{ fqn, planCode, server, memory, storage, systemStorage?, datacenters: [{ datacenter, availability }] }`. `availability` is one of `unavailable`, `unknown`, or a lead-time code (`1H-high`, `1H-low`, `24H-high`, `24H-low`, `72H`, ...). These are unofficial/undocumented endpoints - no SLA, shape could change without notice.

## Goals / Non-Goals

**Goals:**
- Single `docker compose up -d` deploys the whole thing on a VPS with no external dependencies (no managed DB, no message broker).
- Survive container restarts without re-firing webhooks for state that was already available.
- Keep the image small and the stack boring - this is a single-user utility, not a multi-tenant service.

**Non-Goals:**
- Multi-user accounts/auth (single operator is assumed; see Risks for how to restrict access).
- Historical analytics/charting of availability over time (only last-known-state is kept, not a time series).
- A build pipeline / SPA framework for the frontend - a single server-rendered-ish static page with vanilla JS is enough for list + filter + select.

## Decisions

### Stack: Node.js (TypeScript) + Fastify + node:sqlite, vanilla JS frontend
- **Why**: one language for backend, scheduler, and API; Fastify is lightweight and has first-class static-file serving; the built-in `node:sqlite` module (`DatabaseSync`, stable by default since Node 22.5+) gives a synchronous, embedded, zero-ops datastore with no native addon to compile - simpler and more portable across architectures/libc than `better-sqlite3`, which requires a native build toolchain (and has no prebuilt binary for every Node version/platform combination). A vanilla JS frontend avoids a build step entirely, so the Dockerfile is just "install deps, copy files, run".
- **Alternatives considered**: `better-sqlite3` (rejected - adds a native-module build step for no behavioral benefit at this scale); Python/FastAPI + SQLite (equally valid, chosen Node for built-in `fetch`/single runtime for both scheduler and web server); a SPA framework (React/Vue) - rejected as unnecessary weight for one filterable table and a watchlist.
- **Constraint**: requires Node.js >= 22.5 (the base image and `engines.node` are pinned accordingly).

### In-process scheduler, not a separate cron container
- **Why**: one container to run and reason about; the poll interval is just a `setInterval` guarded against overlap (skip a tick if the previous one hasn't finished).
- **Trade-off**: ties polling liveness to the web process; acceptable for a single-instance utility. Mitigation: container restarts automatically reload persisted state, so a crash loses at most one poll interval, not correctness.

### SQLite schema
- `watchlist(id, region, plan_code, datacenter, fqn, server, last_status, last_checked_at, created_at)` - one row per watched `(region, planCode, datacenter)`; `last_status` persists the classification from `availability-polling` so restarts don't re-fire events for already-available entries.
- `webhooks(id, url, secret, active, created_at)` - destination config from `webhook-notifications`.
- `webhook_deliveries(id, watch_id, webhook_id, event_key, attempt_count, status, next_attempt_at, last_error, created_at)` - durable delivery/retry queue; `event_key` (e.g. `watch_id:timestamp`) enforces at-most-once delivery per event per destination even across restarts.

### Catalog fetch + cache
- Both region endpoints are fetched with a shared in-memory cache keyed by region, honoring the 30s minimum refetch interval from `server-catalog`. Facets (distinct datacenters/memory/storage/regions) are computed from the cached data on read, not stored separately - the catalog is small enough to filter in-memory per request.

### Webhook delivery
- Delivery is a small worker loop reading due rows from `webhook_deliveries` (status `pending`, `next_attempt_at <= now`), POSTing the JSON payload with an `X-Signature` HMAC-SHA256 header (per-destination secret) when a secret is configured, and updating `attempt_count`/`next_attempt_at` (exponential backoff: 1m, 2m, 4m, 8m, 16m, capped at the configured max attempts, default 5) or marking `status = 'failed'` once exhausted.

### API surface (consumed by the one HTML page)
- `GET /api/catalog?region=&q=&datacenter=&memory=&storage=&availability=` - filtered catalog read (server-catalog).
- `GET /api/catalog/facets` - distinct filter values for building dropdowns.
- `GET /api/watchlist`, `POST /api/watchlist`, `DELETE /api/watchlist/:id` - watchlist-management.
- `GET /api/webhooks`, `POST /api/webhooks`, `DELETE /api/webhooks/:id` - webhook-notifications config.

## Risks / Trade-offs

- [Unofficial OVH endpoint shape changes or starts requiring auth] → Mitigate with tolerant/defensive parsing (missing fields don't crash the poller) and clear error logging; this is inherent to depending on an undocumented API and can't be fully eliminated.
- [No authentication on the web UI/API] → Out of scope per Non-Goals, but documented in the README: run behind a reverse proxy with basic auth, or bind to a VPN/private interface, since the compose file as shipped exposes the page on the host port.
- [SQLite single-writer] → Fine at this scale (one user, low write volume); not a real constraint here.
- [In-process scheduler tied to web process uptime] → Acceptable trade-off for single-container simplicity; documented above.

## Migration Plan

Greenfield - no migration from a prior system. Deployment is: build/pull the image, `docker compose up -d` with a named volume mounted for the SQLite file, configure `POLL_INTERVAL_SECONDS` and (optionally) a reverse proxy in front. Rollback is simply stopping the container; the volume retains watchlist/webhook config for the next start.
