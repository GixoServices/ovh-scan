# availability-polling Specification

## Purpose
Periodically re-checks only the watched catalog entries and detects the moment any of them transitions into an available state.

## Requirements

### Requirement: Poll watched entries on an interval
The system SHALL periodically refresh the catalog and re-evaluate the availability classification of every entry currently on the watchlist, at a configurable interval (default: every 5 minutes).

#### Scenario: Interval elapses with active watches
- **WHEN** the configured polling interval elapses and the watchlist is non-empty
- **THEN** the system refreshes the catalog and re-evaluates each watched entry's classification

#### Scenario: Empty watchlist
- **WHEN** the watchlist is empty
- **THEN** the system SHALL still poll on the configured interval but performs no transition evaluation (no entries to check)

### Requirement: Detect availability transitions
The system SHALL compare each watched entry's newly fetched classification against its last-known classification and SHALL emit an "became available" event only on a transition from "not available" to "available".

#### Scenario: Entry becomes available
- **WHEN** a watched entry's last-known classification was "not available" and the new classification is "available"
- **THEN** the system emits a "became available" event for that entry

#### Scenario: Entry stays available
- **WHEN** a watched entry's last-known classification was already "available" and the new classification is still "available"
- **THEN** the system does not emit a new event (no duplicate notification for a sustained availability)

#### Scenario: Entry becomes unavailable
- **WHEN** a watched entry's classification changes from "available" to "not available"
- **THEN** the system updates the stored last-known state but does not emit a "became available" event

### Requirement: Persist last-known state
The system SHALL persist each watched entry's last-known availability classification so that transition detection is correct across application restarts (a restart SHALL NOT re-fire an event for a state that was already available before the restart).

#### Scenario: Restart while an entry is already available
- **WHEN** the application restarts and a watched entry's persisted last-known state was already "available"
- **THEN** the first poll after restart does not emit a duplicate "became available" event for that entry

### Requirement: Tolerate upstream fetch failures
The system SHALL skip transition evaluation for a polling cycle where the catalog fetch failed for the affected region, and SHALL retry on the next scheduled interval without crashing the poller.

#### Scenario: Catalog fetch fails for a cycle
- **WHEN** the catalog refresh fails for a watched entry's region during a polling cycle
- **THEN** the system leaves that entry's last-known state unchanged and tries again on the next interval
