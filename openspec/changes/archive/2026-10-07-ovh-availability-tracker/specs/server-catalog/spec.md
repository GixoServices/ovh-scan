# Spec Delta

## Purpose

Fetches, normalizes, and caches OVH dedicated-server availability data from the US and EU public endpoints so the rest of the system can display and poll it without hitting OVH on every request.

## ADDED Requirements

### Requirement: Fetch availability from both regions
The system SHALL fetch server/datacenter availability data from both `https://api.us.ovhcloud.com/v1/dedicated/server/datacenter/availabilities` and `https://api.ovh.com/v1/dedicated/server/datacenter/availabilities` on demand, without requiring OVH API credentials (these endpoints are public read-only).

#### Scenario: Both regions are fetched
- **WHEN** the catalog is refreshed
- **THEN** the system requests both the US and EU availability endpoints and merges the results, tagging each entry with its source region (`us` or `eu`)

#### Scenario: One region is unreachable
- **WHEN** one endpoint fails or times out
- **THEN** the system still returns the successfully fetched region's data and marks the failed region's status as degraded, rather than failing the whole catalog fetch

### Requirement: Normalize catalog entries
The system SHALL normalize each raw entry into a consistent record keyed by `(region, planCode, datacenter)`, retaining `fqn`, `server`, `memory`, `storage`, and the raw `availability` code per datacenter.

#### Scenario: Entry with multiple datacenters
- **WHEN** a raw entry lists availability for several datacenters
- **THEN** the system produces one normalized record per `(region, planCode, datacenter)` pair

### Requirement: Classify availability codes
The system SHALL classify each datacenter's raw availability code as either "available" (any value other than `unavailable` or `unknown`, e.g. `1H-high`, `24H-low`, `72H`) or "not available" (`unavailable` or `unknown`).

#### Scenario: Lead-time code is available
- **WHEN** a datacenter's raw code is `1H-high`
- **THEN** the system classifies it as "available"

#### Scenario: Unavailable or unknown is not available
- **WHEN** a datacenter's raw code is `unavailable` or `unknown`
- **THEN** the system classifies it as "not available"

### Requirement: Filter the catalog along multiple dimensions
The system SHALL expose the normalized, classified catalog filterable by any combination of: free-text match on plan code/server/fqn, region (`us`/`eu`), one or more datacenters, memory, storage, and availability status (`available` / `not available` / `all`). Filters SHALL combine with AND semantics, and the free-text match SHALL be case-insensitive and match substrings.

#### Scenario: Search by plan code substring
- **WHEN** the UI requests the catalog filtered by a plan code substring
- **THEN** the system returns only matching entries across both regions

#### Scenario: Combine multiple filters
- **WHEN** the UI requests the catalog filtered by region `eu`, datacenter `rbx`, and availability status `available`
- **THEN** the system returns only EU entries at the `rbx` datacenter currently classified as available

#### Scenario: No filters supplied
- **WHEN** the UI requests the catalog with no filters
- **THEN** the system returns the full normalized catalog across both regions

#### Scenario: Filters applied server-side with no matches
- **WHEN** the supplied filters match no catalog entries
- **THEN** the system returns an empty result set rather than an error

### Requirement: Expose filter facets
The system SHALL expose the set of distinct values available for region, datacenter, memory, and storage across the current catalog, so the UI can render them as selectable filter options (e.g. dropdowns/checkboxes) instead of requiring free text for every dimension.

#### Scenario: UI loads filter options
- **WHEN** the UI requests the available filter facets
- **THEN** the system returns the distinct regions, datacenters, memory sizes, and storage configurations present in the current catalog

### Requirement: Rate-limit upstream requests
The system SHALL cache the most recent successful fetch per region and SHALL NOT issue a new request to either OVH endpoint more often than once every 30 seconds, serving the cached result to any request that arrives sooner.

#### Scenario: Rapid repeated refresh requests
- **WHEN** a second catalog refresh is requested less than 30 seconds after the last one
- **THEN** the system returns the cached data instead of calling OVH again
