# Spec Delta

## MODIFIED Requirements

### Requirement: Poll watched entries on an interval
The system SHALL periodically refresh the catalog and re-evaluate the availability classification of every entry currently on the watchlist, at a configurable interval (default: every 5 minutes).

#### Scenario: Interval elapses with active watches
- **WHEN** the configured polling interval elapses and the watchlist is non-empty
- **THEN** the system refreshes the catalog and re-evaluates each watched entry's classification

#### Scenario: Empty watchlist
- **WHEN** the watchlist is empty
- **THEN** the system SHALL still poll on the configured interval but performs no transition evaluation (no entries to check)
