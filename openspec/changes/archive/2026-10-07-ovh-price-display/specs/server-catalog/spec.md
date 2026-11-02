# Spec Delta

## MODIFIED Requirements

### Requirement: Normalize catalog entries
The system SHALL normalize each raw entry into a consistent record keyed by `(region, planCode, datacenter)`, retaining `fqn`, `server`, `memory`, `storage`, and the raw `availability` code per datacenter. When a computed price is available for the entry's exact `(planCode, memory, storage, systemStorage)` configuration, the normalized record SHALL also carry that price (amount and currency); otherwise the price field SHALL be absent/null rather than causing the entry to be omitted.

#### Scenario: Entry with multiple datacenters
- **WHEN** a raw entry lists availability for several datacenters
- **THEN** the system produces one normalized record per `(region, planCode, datacenter)` pair

#### Scenario: Entry with a computable price
- **WHEN** a normalized entry's configuration can be matched to a priced catalog plan
- **THEN** the record includes the computed monthly price and its currency

#### Scenario: Entry with no computable price
- **WHEN** a normalized entry's configuration cannot be matched to pricing data
- **THEN** the record is still returned, with its price field absent/null, rather than being dropped from the catalog
