# webhook-notifications Specification

## Purpose
Delivers a notification to one or more user-configured webhook URLs the moment a watched server/datacenter becomes available.

## Requirements

### Requirement: Configure webhook destinations
The system SHALL allow a user to configure one or more destination webhook URLs via the web UI, each persisted independently of the watchlist.

#### Scenario: User adds a webhook URL
- **WHEN** a user submits a new webhook URL
- **THEN** the system validates it is a well-formed `http(s)://` URL and persists it as an active destination

#### Scenario: User removes a webhook URL
- **WHEN** a user removes a configured webhook destination
- **THEN** the system stops sending future notifications to that URL

### Requirement: Deliver notification on availability event
The system SHALL send an HTTP POST with a JSON body to every configured, active webhook destination whenever a "became available" event is emitted for a watched entry.

#### Scenario: Single watched entry becomes available
- **WHEN** a "became available" event is emitted for one watched entry
- **THEN** the system POSTs a JSON payload containing at least the region, plan code, datacenter, raw availability code, and the detection timestamp to each active webhook destination

### Requirement: Retry failed deliveries
The system SHALL retry a failed webhook delivery (non-2xx response or network error) with exponential backoff, up to a configurable maximum number of attempts (default: 5), after which the delivery SHALL be marked as failed and not retried further.

#### Scenario: Destination temporarily unreachable
- **WHEN** a webhook destination returns a connection error on the first attempt
- **THEN** the system retries with an increasing delay until it succeeds or the maximum attempt count is reached

#### Scenario: Maximum retries exhausted
- **WHEN** a webhook delivery has failed on every attempt up to the configured maximum
- **THEN** the system stops retrying that delivery and records it as failed

### Requirement: Sign delivery payloads
The system SHALL include an HMAC signature header computed over the request body using a per-destination secret, so receivers can verify the notification's authenticity.

#### Scenario: Destination has a configured secret
- **WHEN** a webhook destination has a signing secret configured
- **THEN** every delivery to that destination includes a signature header the receiver can verify against the raw body

### Requirement: Avoid duplicate deliveries per event
The system SHALL deliver each distinct "became available" event to a given destination at most once, independent of retries for other events.

#### Scenario: Two separate events in quick succession
- **WHEN** two different watched entries become available within the same polling cycle
- **THEN** the system sends two distinct deliveries, each retried independently on its own failure

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
