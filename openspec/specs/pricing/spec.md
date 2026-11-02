# pricing Specification

## Purpose
Fetches and caches OVH's public order-catalog pricing data and computes a real monthly price for a specific catalog entry's exact configuration, in the correct regional currency.

## Requirements

### Requirement: Fetch regional pricing catalogs
The system SHALL fetch OVH's public order-catalog pricing data for both the `baremetalServers` and `eco` product catalogs, for both regions, using the EU catalog with `ovhSubsidiary=GB` (GBP) and the US catalog with `ovhSubsidiary=US` (USD), without requiring OVH API credentials.

#### Scenario: Both regions' pricing is fetched
- **WHEN** the pricing catalog is refreshed
- **THEN** the system fetches both catalogs for both regions and indexes the combined plans and addons per region, tagged with that region's currency

#### Scenario: Pricing fetch fails for a region
- **WHEN** a region's pricing catalogs fail to fetch or time out
- **THEN** the system continues serving availability data for that region without prices, rather than failing the whole catalog request

### Requirement: Compute a configuration-specific monthly price
The system SHALL compute a monthly recurring price for a given `(planCode, memory, storage, systemStorage)` by summing the matched plan's default no-commitment monthly price with the monthly price delta of whichever memory, storage, and system-storage addons match the entry's specific values (not merely the plan's default configuration).

#### Scenario: Entry matches the plan's default configuration
- **WHEN** an entry's memory/storage/systemStorage match the plan's default addons
- **THEN** the computed price equals the plan's base monthly price (zero addon delta)

#### Scenario: Entry matches an upgraded configuration
- **WHEN** an entry's storage (or memory, or system-storage) differs from the plan's default addon
- **THEN** the computed price equals the plan's base monthly price plus that addon's own monthly price

#### Scenario: No monthly-recurring price exists
- **WHEN** a matched plan or addon has no no-commitment, 1-month-interval recurring price entry
- **THEN** the system treats the entry as having no computable price rather than guessing from a one-time or multi-month commitment price

### Requirement: Tolerate unmatched or ambiguous configurations
The system SHALL return no price (rather than an incorrect one) when the entry's plan code isn't found in the pricing catalogs, or when an entry's memory/storage/systemStorage value can't be matched to exactly one addon in good confidence.

#### Scenario: Plan code not present in pricing catalogs
- **WHEN** an entry's plan code has no corresponding plan in either pricing catalog
- **THEN** the system returns no price for that entry

#### Scenario: Ambiguous addon match
- **WHEN** an entry's field value matches more than one addon code in a family and the shortest-match tie-break still leaves genuine ambiguity
- **THEN** the system does not guess and returns no price for that entry

### Requirement: Cache pricing data with a long TTL
The system SHALL cache each region's fetched pricing catalogs and SHALL NOT refetch them more often than a configurable interval (default: 6 hours), since pricing catalogs are large and change far less often than stock availability.

#### Scenario: Repeated price lookups within the cache window
- **WHEN** multiple catalog requests occur within the configured pricing cache TTL
- **THEN** the system reuses the cached pricing data instead of refetching OVH's order-catalog endpoints
