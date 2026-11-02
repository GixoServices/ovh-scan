# Tasks

## 1. Project Setup

- [x] 1.1 Initialize Node.js/TypeScript project (`package.json`, `tsconfig.json`) with Fastify (using the built-in `node:sqlite` module, no native DB dependency); verify `npm install` and `npm run build` succeed
- [x] 1.2 Set up SQLite schema/migration on startup (`watchlist`, `webhooks`, `webhook_deliveries` tables per design.md); verify tables are created on a fresh DB file
- [x] 1.3 Add config loading from env vars (`PORT`, `DATA_DIR`, `POLL_INTERVAL_SECONDS`, `MAX_WEBHOOK_ATTEMPTS`) with sane defaults; verify defaults apply when env vars are unset

## 2. Server Catalog

- [x] 2.1 Implement OVH fetch client for both US and EU endpoints with per-region 30s cache (per `server-catalog` spec); verify with a unit test that a second call within 30s does not re-fetch
- [x] 2.2 Implement normalization into `(region, planCode, datacenter)` records and availability classification (`available` vs `not available`); verify with unit tests covering `1H-high`, `unknown`, and `unavailable` codes
- [x] 2.3 Implement partial-failure handling so one region failing doesn't fail the whole catalog fetch; verify with a test that mocks one region erroring
- [x] 2.4 Implement `GET /api/catalog` with combined filters (free-text, region, datacenter, memory, storage, availability status); verify with tests for each filter dimension and combinations
- [x] 2.5 Implement `GET /api/catalog/facets` returning distinct regions/datacenters/memory/storage values; verify it reflects the current cached catalog

## 3. Watchlist

- [x] 3.1 Implement `POST /api/watchlist` (add, dedupe on existing tuple) and `DELETE /api/watchlist/:id`; verify with tests for add, duplicate add, and remove
- [x] 3.2 Implement `GET /api/watchlist` returning each entry with `last_status`/`last_checked_at`; verify response shape against `watchlist-management` spec
- [x] 3.3 Verify watchlist persists across a process restart (integration test: insert, restart DB connection, re-read)

## 4. Availability Polling

- [x] 4.1 Implement the interval-based poller (overlap-guarded) that re-evaluates catalog classification for every watched entry; verify it runs on the configured interval via a test with a shortened interval
- [x] 4.2 Implement transition detection (not-available→available fires an event; available→available and available→not-available do not fire a "became available" event); verify with unit tests for all three transitions
- [x] 4.3 Persist `last_status` after each poll and verify a restart does not re-fire an event for an entry already available before restart
- [x] 4.4 Verify a region fetch failure during a poll cycle leaves affected entries' state unchanged and does not crash the poller (test with mocked fetch failure)

## 5. Webhook Notifications

- [x] 5.1 Implement `POST /api/webhooks` (URL validation, optional secret) and `DELETE /api/webhooks/:id`, `GET /api/webhooks`; verify with tests including rejection of a malformed URL
- [x] 5.2 On a "became available" event, enqueue a `webhook_deliveries` row per active destination with a unique `event_key`; verify two events produce independent delivery rows
- [x] 5.3 Implement the delivery worker: POST JSON payload, HMAC-SHA256 `X-Signature` header when a secret is set, exponential backoff on failure up to `MAX_WEBHOOK_ATTEMPTS`, mark `failed` after exhaustion; verify with tests simulating a failing destination reaching max attempts and a destination recovering mid-retry
- [x] 5.4 Verify delivery payload includes region, plan code, datacenter, raw availability code, and detection timestamp (matches `webhook-notifications` spec)

## 6. Web UI

- [x] 6.1 Build static HTML/JS page: catalog table with filter controls backed by `/api/catalog` and `/api/catalog/facets` (free text, region, datacenter, memory, storage, availability dropdowns/checkboxes); verify manually that filters narrow results and combine with AND semantics
- [x] 6.2 Add "Watch" action per filtered row/datacenter calling `POST /api/watchlist`, and a watchlist panel listing current watches with status/last-checked and a remove action; verify manually end-to-end (filter → watch → appears in watchlist → remove)
- [x] 6.3 Add a webhook config panel (list/add/remove destinations) calling `/api/webhooks`; verify manually that an added destination appears and can be removed
- [x] 6.4 Serve the static page from the Fastify app at `/`; verify it loads with no build step required

## 7. Docker Packaging

- [x] 7.1 Write a multi-stage `Dockerfile` (build TS, run on slim Node image); verify `docker build` produces a working image
- [x] 7.2 Write `docker-compose.yml` with the app service, a named volume mounted at `DATA_DIR` for the SQLite file, and env var passthrough; verify `docker compose up -d` serves the page and the DB file persists in the volume
- [x] 7.3 Verify restart persistence end-to-end in Docker: watch an entry, `docker compose restart`, confirm the watchlist and `last_status` survive

## 8. Documentation

- [x] 8.1 Write a README covering: what this does, `docker compose up -d` quickstart, env vars, and the no-auth-by-default risk with a reverse-proxy/basic-auth recommendation (per design.md Risks)
