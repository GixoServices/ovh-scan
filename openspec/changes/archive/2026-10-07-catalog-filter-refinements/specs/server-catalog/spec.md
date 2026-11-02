# Spec Delta

## MODIFIED Requirements

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
