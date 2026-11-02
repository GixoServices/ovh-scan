# Tasks

## 1. Backend

- [x] 1.1 Replace `classify()`'s denylist logic with an allowlist regex matching the lead-time pattern (`/^\d+H(-high|-low)?$/i`); verify with unit tests covering every raw code observed live (`1H-high`, `1H-low`, `72H`, `720H`, `1440H`, `unavailable`, `unknown`, `comingSoon`) plus an arbitrary unrecognized string
- [x] 1.2 Verify no other code assumed the old denylist behavior (grep for `classify` usages/tests)

## 2. Deployment Verification

- [x] 2.1 Rebuild and restart the running stack; verify live via the API that a `comingSoon` entry now classifies as `not_available`
- [x] 2.2 Confirm the previously-affected watchlist row corrects on its next poll cycle (or note the expected delay if not waited out)
