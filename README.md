# OVH Availability Tracker

Watch OVH dedicated server plans (US and EU catalogs) and get a webhook the instant one you care about comes into stock.

It polls the public, unauthenticated OVH availability endpoints:

- `https://api.us.ovhcloud.com/v1/dedicated/server/datacenter/availabilities`
- `https://api.eu.ovhcloud.com/v1/dedicated/server/datacenter/availabilities`

A single page lets you search/filter the combined catalog (plan code, server, region, datacenter, memory, storage, availability), see a computed monthly price per row (GBP for EU, USD for US — sourced from OVH's public order-catalog pricing API, matched to the exact memory/storage configuration shown; a small fraction of rows show "–" when no confident price match exists), pick the `(region, planCode, datacenter)` combinations you want to watch, and configure one or more webhook URLs. A background poller (default: every 60s) re-checks only your watched entries and fires a signed webhook POST the moment one flips from `unavailable`/`unknown` to an actual lead-time code (e.g. `1H-high`, `24H-low`, `72H`).

## Quickstart

```bash
docker compose up -d
```

Then open `http://<your-vps-host>:3000`.

State (watchlist, webhook config, last-known status) is persisted in a SQLite file inside the `ovh-data` named volume, so it survives container restarts and `docker compose down` (without `-v`).

## Configuration

Set via environment variables (see `docker-compose.yml`):

| Variable                 | Default | Meaning                                                   |
| ------------------------ | ------- | ---------------------------------------------------------- |
| `HOST_PORT`               | `3000`  | Host port the UI/API is published on                      |
| `POLL_INTERVAL_SECONDS`   | `300`   | How often watched entries are re-checked (5 min)           |
| `CATALOG_CACHE_SECONDS`   | `30`    | Minimum time between re-fetching each OVH region endpoint  |
| `MAX_WEBHOOK_ATTEMPTS`    | `5`     | Max delivery retries (exponential backoff) before giving up |
| `PRICE_CACHE_SECONDS`     | `21600` | Minimum time between re-fetching OVH's pricing catalogs (6h; they're large and change rarely) |

## Webhook payload

```json
{
  "region": "eu",
  "planCode": "25ska01",
  "datacenter": "rbx",
  "fqn": "25ska01.ram-64g-ecc-2933.softraid-2x4000sa",
  "server": "25ska01",
  "rawAvailability": "1H-high",
  "detectedAt": "2026-10-07T12:00:00.000Z"
}
```

If a webhook destination has a secret configured, each delivery includes an `X-Signature` header: `HMAC-SHA256(secret, rawBody)` as a hex digest, so you can verify authenticity before trusting the payload.

## ⚠️ No built-in authentication

This app ships with no login and no API auth — it's meant for a single operator. The compose file exposes port 3000 directly on the host. Before running it on a public VPS:

- Put it behind a reverse proxy (Caddy/Nginx/Traefik) with HTTP basic auth or your own SSO, or
- Bind it to a private/VPN-only interface instead of `0.0.0.0`, or
- At minimum, restrict inbound access to port 3000 with your VPS firewall.

## Development

```bash
npm install
npm run dev     # tsx watch, no build step
npm test        # node's built-in test runner via tsx
npm run build   # compile to dist/
```

Requires Node.js >= 22.5 (uses the built-in `node:sqlite` module — no native dependencies to compile).
