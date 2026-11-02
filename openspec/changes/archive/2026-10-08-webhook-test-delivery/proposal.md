# Proposal

## Why

There's no way to verify a configured webhook URL (and secret, if set) actually works without waiting for a real "became available" event, which could be hours or days away. The user asked for a way to test a webhook destination immediately after adding it.

## What Changes

- Add a "Test" button next to each configured webhook destination that sends a one-off test payload immediately (bypassing the retry queue - a test is a single synchronous attempt, not a durable delivery) and shows the result (success + HTTP status, or the failure reason) inline.

## Capabilities

### Modified Capabilities
- `webhook-notifications`: add a requirement for on-demand test delivery to a configured destination.

## Impact

- New endpoint: `POST /api/webhooks/:id/test`.
- `src/webhooks.ts`: extract the shared signed-POST logic so both the retry-queue delivery path and the new one-off test path use the same signing/timeout behavior.
- `public/app.js` / `public/styles.css`: a "Test" button and inline status per webhook list entry.
