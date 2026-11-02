# Spec Delta

## Purpose

Lets a user pick which `(region, planCode, datacenter)` combinations from the catalog they want tracked, and persists that selection across restarts.

## ADDED Requirements

### Requirement: Add entries to the watchlist
The system SHALL allow a user to add one or more catalog entries, identified by `(region, planCode, datacenter)`, to a persistent watchlist via the web UI, selected from the (optionally filtered) catalog view.

#### Scenario: User selects a server/datacenter pair
- **WHEN** a user selects a catalog row and datacenter and confirms "Watch"
- **THEN** the system adds that `(region, planCode, datacenter)` tuple to the watchlist and persists it

#### Scenario: User selects from a filtered result set
- **WHEN** a user has applied catalog filters and selects an entry from the filtered results
- **THEN** the system adds the selected entry to the watchlist exactly as if no filter had been applied (filtering only narrows what is shown, not what can be selected)

#### Scenario: Duplicate watch request
- **WHEN** a user adds a `(region, planCode, datacenter)` tuple that is already on the watchlist
- **THEN** the system leaves the existing entry unchanged and does not create a duplicate

### Requirement: Remove entries from the watchlist
The system SHALL allow a user to remove a previously watched `(region, planCode, datacenter)` tuple.

#### Scenario: User unwatches an entry
- **WHEN** a user removes a watched entry from the UI
- **THEN** the system deletes it from the persistent watchlist and the polling system stops tracking it

### Requirement: Persist the watchlist across restarts
The system SHALL persist the watchlist to durable storage such that it survives an application restart or container recreation.

#### Scenario: Application restarts
- **WHEN** the application restarts
- **THEN** the previously saved watchlist is reloaded unchanged

### Requirement: Display current watchlist state
The system SHALL show, for each watched entry, its last-known availability classification and the timestamp it was last checked.

#### Scenario: Viewing the watchlist
- **WHEN** a user opens the watchlist view
- **THEN** the system displays each watched entry with its current availability status and last-checked time
