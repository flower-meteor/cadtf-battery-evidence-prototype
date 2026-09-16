# CADTF Prototype Design

## 1. Purpose

The prototype tests whether a battery-health estimate can remain connected
to the physical installation, configuration, software baseline, calibration,
measurement source, model validity and authorised review that support its use.

It is a ground-based advisory prototype. It does not control the aircraft,
authorise dispatch, replace approved maintenance procedures or establish
battery safety.

## 2. Architecture

The implementation uses five layers:

1. **Presentation:** Streamlit supports fleet, measurement, evidence, review,
   pilot-evaluation and export workflows.
2. **Application services:** `CADTFService` coordinates records, model-domain
   checks, health estimation, evidence generation, reviews and exports.
3. **Domain logic:** typed records, interpretable health calculations and
   validation rules are separated from the interface.
4. **Persistence:** SQLite stores aircraft, packs, model domains,
   installations, measurements, estimates, reviews, events and synthetic
   pilot results in one local database.
5. **Evidence:** every estimate creates a canonical JSON evidence package and
   a SHA-256 hash covering the asset, input, model, validation and estimate.

## 3. End-to-End Workflow

The implemented workflow is:

`Installation record -> Measurement import -> Data validation -> Model-domain
check -> Health estimate -> Evidence package -> Authorised review -> Export`

The system distinguishes three states:

- `valid`: the result may be used within the stated validation domain.
- `review_required`: configuration, software, calibration, boundary or
  provenance findings must be closed before release.
- `blocked`: temperature, chemistry, rate or cycle conditions are outside the
  model domain, so the advisory is suppressed.

## 4. Health Model

The prototype deliberately uses an interpretable engineering baseline rather
than a complex black-box model:

- Capacity health: measured capacity divided by rated capacity.
- Resistance health: baseline resistance divided by measured resistance.
- State of health: 75% capacity-health weight and 25% resistance-health weight.
- Usable power: a resistance- and temperature-adjusted ratio.
- Uncertainty: increases with cycle use, thermal-limit proximity, invalid
  calibration and unresolved review conditions.
- Remaining cycles: an explicitly indicative extrapolation, not a maintenance
  decision.

The values are prototype calculations. They are not validated for a real
aircraft battery and must not be used for airworthiness decisions.

## 5. Model-Domain Checks

The prototype checks:

- pack chemistry against the selected model;
- minimum and maximum temperature against the validated envelope;
- charge and discharge rates;
- cycle count against the validated life range;
- configuration revision against the validated baseline;
- software major version;
- sensor-calibration validity;
- measurement provenance and source hash.

Configuration or software changes automatically create review findings when
the new baseline has not been included in the validation evidence.

## 6. Evidence Package

Each package contains:

- physical asset and current installation;
- input measurement and source hash;
- model identity and full validation domain;
- validation checks and findings;
- calculated estimate and uncertainty;
- review requirement and disposition state;
- package traceability score and SHA-256 integrity hash.

The evidence package is immutable after creation. Later review decisions are
stored separately and linked to the estimate.

## 7. Roles

- Manufacturer: controls design baselines, model version and interfaces.
- Operator: maintains aircraft and installation records.
- Maintenance organisation: records inspections, measurements and actions.
- Engineering team: manages the dictionary, analysis software and evidence
  verification.
- Regulatory specialist: advises on evidence acceptability and approval.

The prototype demonstrates the data and workflow boundaries for these roles.
It does not implement production identity, access or approval controls.

## 8. Synthetic Demonstration Data

The database contains three deterministic battery packs:

- a nominal NMC pack;
- a high-stress NMC pack that is correctly blocked;
- a valid LFP pack.

The pilot-evaluation page contains 24 deterministic synthetic records across
manual and CADTF methods. These records exercise the evaluation interface and
are not actual pilot results.

## 9. Production Extension

A production or controlled pilot implementation would add:

- authenticated users and role-based access;
- signed configuration and review records;
- data ingestion from approved maintenance and flight-data systems;
- validation on representative pack data;
- independent model verification and uncertainty assessment;
- protected audit storage and key management;
- security, privacy and regulatory review;
- integration and rollback procedures.
