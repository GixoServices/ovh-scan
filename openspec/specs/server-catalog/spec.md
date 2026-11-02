# server-catalog Specification

## Purpose
Fetches, normalizes, and caches OVH dedicated-server availability data from the US and EU public endpoints so the rest of the system can display and poll it without hitting OVH on every request.

## Requirements

### Requirement: Fetch availability from both regions
The system SHALL fetch server/datacenter availability data from both `https://api.us.ovhcloud.com/v1/dedicated/server/datacenter/availabilities` and `https://api.eu.ovhcloud.com/v1/dedicated/server/datacenter/availabilities` on demand, without requiring OVH API credentials (these endpoints are public read-only).

#### Scenario: Both regions are fetched
- **WHEN** the catalog is refreshed
- **THEN** the system requests both the US and EU availability endpoints and merges the results, tagging each entry with its source region (`us` or `eu`)

#### Scenario: One region is unreachable
- **WHEN** one endpoint fails or times out
- **THEN** the system still returns the successfully fetched region's data and marks the failed region's status as degraded, rather than failing the whole catalog fetch

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

### Requirement: Classify availability codes
The system SHALL classify each datacenter's raw availability code as "available" only if it matches a recognized lead-time pattern (one or more digits followed by `H`, optionally suffixed `-high` or `-low`, e.g. `1H-high`, `24H-low`, `72H`, `720H`, `1440H`). Every other raw code - including `unavailable`, `unknown`, `comingSoon`, and any other code not matching the lead-time pattern - SHALL classify as "not available", so an unrecognized or not-yet-orderable status never counts as available.

#### Scenario: Lead-time code is available
- **WHEN** a datacenter's raw code is `1H-high`
- **THEN** the system classifies it as "available"

#### Scenario: Unavailable or unknown is not available
- **WHEN** a datacenter's raw code is `unavailable` or `unknown`
- **THEN** the system classifies it as "not available"

#### Scenario: "Coming soon" is not available
- **WHEN** a datacenter's raw code is `comingSoon`
- **THEN** the system classifies it as "not available", since the plan is not yet orderable

#### Scenario: Unrecognized future code defaults to not available
- **WHEN** a datacenter's raw code does not match the lead-time pattern and is not one of the known not-available codes
- **THEN** the system classifies it as "not available" rather than assuming it means available

### Requirement: Filter the catalog along multiple dimensions
The system SHALL expose the normalized, classified catalog filterable by any combination of: free-text match on plan code/server/fqn, region (`us`/`eu`), one or more datacenters, one or more memory sizes (parsed in GB from the raw memory string, OR semantics across selected sizes), a storage substring (case-insensitive, matched against the raw storage string), and availability status (`available` / `not available` / `all`). Filters SHALL combine with AND semantics across dimensions, and the free-text and storage matches SHALL be case-insensitive and match substrings.

#### Scenario: Search by plan code substring
- **WHEN** the UI requests the catalog filtered by a plan code substring
- **THEN** the system returns only matching entries across both regions

#### Scenario: Filter by multiple memory sizes
- **WHEN** the UI requests the catalog filtered by memory sizes `32` and `64`
- **THEN** the system returns entries whose parsed memory size is 32GB or 64GB, regardless of ECC/speed variant

#### Scenario: Filter by storage substring
- **WHEN** the UI requests the catalog filtered by storage substring `nvme`
- **THEN** the system returns only entries whose raw storage value contains `nvme` (case-insensitively), regardless of disk count/size

#### Scenario: Combine multiple filters
- **WHEN** the UI requests the catalog filtered by region `eu`, datacenter `rbx`, memory size `64`, storage substring `nvme`, and availability status `available`
- **THEN** the system returns only EU entries at the `rbx` datacenter with a 64GB memory size, storage containing `nvme`, currently classified as available

#### Scenario: No filters supplied
- **WHEN** the UI requests the catalog with no filters
- **THEN** the system returns the full normalized catalog across both regions

#### Scenario: Filters applied server-side with no matches
- **WHEN** the supplied filters match no catalog entries
- **THEN** the system returns an empty result set rather than an error

### Requirement: Expose filter facets
The system SHALL expose the set of distinct values available for region, datacenter, and memory size (parsed in GB, sorted numerically ascending) across the current catalog, so the UI can render them as selectable filter options (e.g. checkboxes) instead of requiring free text for every dimension. Storage is filtered by free-text substring and does not need a facet listing.

#### Scenario: UI loads filter options
- **WHEN** the UI requests the available filter facets
- **THEN** the system returns the distinct regions, datacenters, and memory sizes (as numbers, sorted ascending) present in the current catalog

### Requirement: Rate-limit upstream requests
The system SHALL cache the most recent successful fetch per region and SHALL NOT issue a new request to either OVH endpoint more often than once every 30 seconds, serving the cached result to any request that arrives sooner.

#### Scenario: Rapid repeated refresh requests
- **WHEN** a second catalog refresh is requested less than 30 seconds after the last one
- **THEN** the system returns the cached data instead of calling OVH again
