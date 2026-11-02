# Tasks

## 1. Pricing Service

- [x] 1.1 Define minimal raw-catalog types (plan, addon, addonFamily, pricing entry) and fetch both `baremetalServers` and `eco` catalogs for a region (GB for EU, US for US); verify with a unit test using a mocked fetch
- [x] 1.2 Implement per-region in-memory cache with configurable TTL (`PRICE_CACHE_SECONDS`, default 21600s) and per-region degrade-on-failure (keep last-good data); verify with a unit test that a second call within the TTL does not re-fetch, and that one region's failure doesn't affect the other
- [x] 1.3 Implement the monthly-price picker (capacities includes `renew`, interval=1/month, commitment=0, mode=`default`) for both plan and addon pricing entries; verify with unit tests against representative pricing-entry fixtures
- [x] 1.4 Implement addon matching (prefix match on `fieldValue + "-"`, shortest-match tie-break, treat remaining ambiguity as unmatched) for memory/storage/systemStorage; verify with unit tests covering: default config, upgraded config, region-variant plan code mismatch, and genuine ambiguity
- [x] 1.5 Implement `priceFor(region, entry)` combining plan lookup + addon matching + price summation + currency formatting, returning `null` on any unmatched step; verify with unit tests for matched, partially-matched, and fully-unmatched entries

## 2. API Integration

- [x] 2.1 Wire `PricingService` into `GET /api/catalog` so each returned entry includes `price: { amount, currency, formatted } | null`; verify with an integration test against a running server instance
- [x] 2.2 Ensure a pricing fetch failure degrades gracefully (entries still returned with `price: null`, availability unaffected); verify with a test that mocks the pricing fetch failing

## 3. Frontend

- [x] 3.1 Add a "Price" column to the catalog table showing the formatted monthly price or "—" when unavailable; verify manually that prices render correctly for both EU (GBP) and US (USD) rows

## 4. Docker/Config

- [x] 4.1 Add `PRICE_CACHE_SECONDS` to `docker-compose.yml` environment passthrough and the README's configuration table; verify `docker compose up -d` still starts cleanly with the new env var
