# Proposal

## Why

OVH publishes real-time dedicated-server stock levels at `GET /v1/dedicated/server/datacenter/availabilities` (both the `api.us.ovhcloud.com` and `api.ovh.com`/EU endpoints — public, unauthenticated, polled directly), but there is no way to watch a specific server/datacenter combination and get notified the moment it flips from `unavailable`/`unknown` to an actual lead-time code (e.g. `1H-high`, `24H-low`, `72H`). Popular configs sell out in minutes, so manually refreshing the API is the only current option. A small self-hosted app that lets someone pick the exact plans they care about and fires a webhook the instant stock appears removes that manual polling.

## What Changes

- Add a web page that lists OVH dedicated server plans (fetched live from both the US and EU availability endpoints), searchable/filterable by plan code, server range, and datacenter.
- Let the user select one or more `(planCode, datacenter)` pairs to watch, persisted across restarts.
- Add a background poller that periodically re-fetches both endpoints, diffs availability per watched pair, and detects "became available" transitions (any move off `unavailable`/`unknown` into a lead-time value).
- Add webhook delivery: on each detected transition, POST a JSON payload to one or more user-configured webhook URLs, with retry-with-backoff on failure.
- Ship the whole thing as a single `docker-compose.yml` (app + persistent volume for the watchlist/state) so it runs unattended on a VPS.

## Capabilities

### New Capabilities

- `server-catalog`: fetch, normalize, and cache OVH server/datacenter availability data from both the US and EU endpoints for display and polling.
- `watchlist-management`: let a user select/deselect which `(planCode, datacenter)` pairs are being watched, and persist that selection.
- `availability-polling`: periodically poll the catalog for watched pairs only, keep last-known state, and detect availability transitions.
- `webhook-notifications`: configure destination webhook URL(s) and deliver a signed notification payload when a watched pair becomes available, with retries.

### Modified Capabilities

(none — greenfield project)

## Impact

- New standalone app (no existing codebase to affect).
- Affects: OVH public availability APIs (read-only, polled on an interval — must respect reasonable polling frequency to avoid hammering OVH), a small persistent store (watchlist + last-known-state + webhook config), and any external service the user points webhooks at.
- Deployment: Docker / Docker Compose, intended to run continuously on a VPS.
