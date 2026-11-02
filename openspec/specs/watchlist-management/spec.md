# watchlist-management Specification

## Purpose
Lets a user pick which `(region, fqn, datacenter)` combinations from the catalog they want tracked - `fqn` uniquely identifies the exact plan/memory/storage configuration - and persists that selection across restarts.

## Requirements

### Requirement: Add entries to the watchlist
The system SHALL allow a user to add one or more catalog entries, identified by `(region, fqn, datacenter)` - `fqn` uniquely identifies the exact plan/memory/storage configuration, since a single `(planCode, datacenter)` pair can have multiple distinct memory/storage variants - to a persistent watchlist via the web UI, selected from the (optionally filtered) catalog view.

#### Scenario: User selects a server/datacenter pair
- **WHEN** a user selects a catalog row and datacenter and confirms "Watch"
- **THEN** the system adds that exact `(region, fqn, datacenter)` tuple to the watchlist and persists it, without affecting any other memory/storage variant that shares the same plan code and datacenter

#### Scenario: User selects from a filtered result set
- **WHEN** a user has applied catalog filters and selects an entry from the filtered results
- **THEN** the system adds the selected entry to the watchlist exactly as if no filter had been applied (filtering only narrows what is shown, not what can be selected)

#### Scenario: Duplicate watch request
- **WHEN** a user adds a `(region, fqn, datacenter)` tuple that is already on the watchlist
- **THEN** the system leaves the existing entry unchanged and does not create a duplicate

#### Scenario: Distinct memory/storage variants at the same plan code and datacenter
- **WHEN** a user watches one memory/storage variant of a plan at a given datacenter
- **THEN** other variants of the same plan code at the same datacenter are NOT marked as watched, and remain independently selectable

### Requirement: Remove entries from the watchlist
The system SHALL allow a user to remove a previously watched `(region, fqn, datacenter)` tuple without affecting any other variant sharing the same plan code and datacenter.

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
