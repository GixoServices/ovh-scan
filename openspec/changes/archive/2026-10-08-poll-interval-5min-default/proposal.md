# Proposal

## Why

User asked for the default watchlist polling interval to be 5 minutes instead of 60 seconds - a more conservative default against OVH's public endpoint while still catching availability within a reasonable window.

## What Changes

- Change the default value of `POLL_INTERVAL_SECONDS` from `60` to `300` (5 minutes) in `src/config.ts`, `docker-compose.yml`, and the README. The env var itself is unchanged and still overridable.

## Capabilities

### Modified Capabilities
- `availability-polling`: the "Poll watched entries on an interval" requirement's stated default changes from 60 seconds to 300 seconds (5 minutes).

## Impact

- `src/config.ts`, `docker-compose.yml`, `README.md`. No code logic changes, only the default value.
