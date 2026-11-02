# Spec Delta

## MODIFIED Requirements

### Requirement: Normalize catalog entries
The system SHALL normalize each raw entry into a consistent record keyed by `(region, fqn, datacenter)` - not `(region, planCode, datacenter)`, since a single plan code at a single datacenter can have multiple distinct raw entries differing only in memory/storage/systemStorage, each with its own `fqn` - retaining `fqn`, `server`, `memory`, `storage`, and the raw `availability` code per datacenter. When a computed price is available for the entry's exact `(planCode, memory, storage, systemStorage)` configuration, the normalized record SHALL also carry that price (amount and currency); otherwise the price field SHALL be absent/null rather than causing the entry to be omitted.

#### Scenario: Entry with multiple datacenters
- **WHEN** a raw entry lists availability for several datacenters
- **THEN** the system produces one normalized record per `(region, fqn, datacenter)` pair

#### Scenario: Same plan code and datacenter, different configuration
- **WHEN** two raw entries share the same `planCode` and list the same `datacenter`, but differ in memory or storage (and therefore have different `fqn` values)
- **THEN** the system produces two distinct normalized records for that datacenter, not one

#### Scenario: Entry with a computable price
- **WHEN** a normalized entry's configuration can be matched to a priced catalog plan
- **THEN** the record includes the computed monthly price and its currency

#### Scenario: Entry with no computable price
- **WHEN** a normalized entry's configuration cannot be matched to pricing data
- **THEN** the record is still returned, with its price field absent/null, rather than being dropped from the catalog
