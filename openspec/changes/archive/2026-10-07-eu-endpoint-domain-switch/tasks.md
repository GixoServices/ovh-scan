# Tasks

## 1. Code

- [x] 1.1 Update `REGION_ENDPOINTS.eu` in `src/catalog.ts` to `https://api.eu.ovhcloud.com/v1/dedicated/server/datacenter/availabilities`; verify `npm run build` and `npm test` still pass
- [x] 1.2 Update `REGION_CATALOG_CONFIG.eu.base` in `src/pricing.ts` to `https://api.eu.ovhcloud.com`; verify `npm run build` and `npm test` still pass

## 2. Verification

- [x] 2.1 Rebuild and run via `docker compose up -d --build`; verify `/api/catalog?region=eu` and `/api/catalog?region=us` both return data with no degraded regions, and EU prices still compute correctly
