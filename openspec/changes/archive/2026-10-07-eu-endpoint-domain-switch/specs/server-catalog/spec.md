# Spec Delta

## MODIFIED Requirements

### Requirement: Fetch availability from both regions
The system SHALL fetch server/datacenter availability data from both `https://api.us.ovhcloud.com/v1/dedicated/server/datacenter/availabilities` and `https://api.eu.ovhcloud.com/v1/dedicated/server/datacenter/availabilities` on demand, without requiring OVH API credentials (these endpoints are public read-only).

#### Scenario: Both regions are fetched
- **WHEN** the catalog is refreshed
- **THEN** the system requests both the US and EU availability endpoints and merges the results, tagging each entry with its source region (`us` or `eu`)

#### Scenario: One region is unreachable
- **WHEN** one endpoint fails or times out
- **THEN** the system still returns the successfully fetched region's data and marks the failed region's status as degraded, rather than failing the whole catalog fetch
