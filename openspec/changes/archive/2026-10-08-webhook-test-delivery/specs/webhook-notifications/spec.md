# Spec Delta

## ADDED Requirements

### Requirement: Send an on-demand test delivery
The system SHALL allow a user to trigger a one-off test delivery to a specific configured webhook destination, sending a signed test payload (if a secret is configured) and reporting the outcome (success with HTTP status, or failure with a reason) back to the user synchronously, without going through the retry queue.

#### Scenario: Test delivery succeeds
- **WHEN** a user triggers a test for a destination that responds with a 2xx status
- **THEN** the system reports success including the HTTP status code, and does not create a retryable delivery record

#### Scenario: Test delivery fails
- **WHEN** a user triggers a test for a destination that is unreachable or returns a non-2xx status
- **THEN** the system reports the failure and its reason, and does not schedule a retry (a test is a single attempt)

#### Scenario: Test delivery includes the signature when a secret is configured
- **WHEN** a user triggers a test for a destination that has a signing secret configured
- **THEN** the test payload includes the same HMAC signature header real deliveries use, so the user can verify their receiver's signature check against a known-test payload
