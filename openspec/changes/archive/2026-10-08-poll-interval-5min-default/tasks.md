# Tasks

## 1. Config

- [x] 1.1 Change the `POLL_INTERVAL_SECONDS` default from `60` to `300` in `src/config.ts`, `docker-compose.yml`, and `README.md`; verify `npm run build` and `npm test` still pass
- [x] 1.2 Verify in the running container: `docker compose up -d` (no `.env` override) reports `POLL_INTERVAL_SECONDS=300` and the poller logs/behaves on that cadence
