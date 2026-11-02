# Tasks

## 1. Backend

- [x] 1.1 Extract the shared signed-POST logic in `src/webhooks.ts` into a helper used by both `deliverOne` (retry-queue path) and a new `sendTestWebhook` (one-off path); verify existing `deliverOne` unit tests still pass unchanged
- [x] 1.2 Implement `sendTestWebhook(webhook, fetchImpl?, timeoutMs?)` returning `{ ok, statusCode?, error? }`, signing the payload when a secret is present, with no DB/queue interaction; verify with unit tests for success, non-2xx response, and network failure
- [x] 1.3 Add `WebhookStore.getById(id)`; verify with a unit test for found/not-found
- [x] 1.4 Add `POST /api/webhooks/:id/test` returning 404 for an unknown id, otherwise the `sendTestWebhook` result; verify with an integration test against a running server instance

## 2. Frontend

- [x] 2.1 Add a "Test" button per webhook list entry that calls the new endpoint and shows inline success/failure status (HTTP status or error message), disabling the button while in flight
- [x] 2.2 Verify manually against a local throwaway HTTP listener: test succeeds and shows the status code; stopping the listener and testing again shows a failure reason
