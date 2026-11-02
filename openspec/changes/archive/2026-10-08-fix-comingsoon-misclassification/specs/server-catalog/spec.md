# Spec Delta

## MODIFIED Requirements

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
