# CADTF Copilot

The public browser app includes a tool-using CADTF Copilot.

## Default Behaviour

The default agent runs entirely in the browser and does not send data to an
external model. It can:

- explain an estimate, SOH and uncertainty;
- list blocked or review-required findings;
- inspect evidence completeness and hashes;
- compare the current evidence hash with the stored previous hash;
- simulate temperature, rate, capacity, resistance and cycle changes;
- draft a review rationale;
- navigate to workflows and download evidence packages;
- respect the selected role and prevent direct acceptance of blocked advice.

Write actions require explicit user confirmation.

## Example Questions

- Why is BAT-002 blocked?
- Check evidence gaps for BAT-001.
- Compare the current evidence with the previous package.
- Change BAT-001 maximum temperature to 50 C and cycles to 1300.
- Draft a review rationale.
- Explain the model limitations.
- Open Data Lab.
- What should I do next?

## Optional Secure AI Gateway

The agent settings panel can store a gateway URL. If a gateway is configured,
the browser sends a JSON request to it and falls back to the local agent if the
gateway is unavailable.

Request body:

```json
{
  "question": "Why is BAT-002 blocked?",
  "language": "en",
  "context": {},
  "tools": [
    "get_estimate",
    "get_validation",
    "get_evidence",
    "compare_evidence",
    "simulate_measurement"
  ],
  "safety": {
    "read_only": true,
    "no_maintenance_approval": true,
    "cite_evidence": true
  }
}
```

Expected response:

```json
{
  "answer": "Evidence-grounded answer",
  "citations": ["EST-BAT-002", "EVIDENCE-EVP-..."],
  "actions": []
}
```

The API key must remain in the server-side gateway. It must never be placed in
the GitHub Pages frontend.

## Safety Boundary

CADTF Copilot cannot:

- approve maintenance;
- release an aircraft;
- change a blocked result to accepted;
- certify a battery or model;
- suppress validation findings;
- guarantee thermal-runaway prevention.

All agent questions and action decisions are added to the local audit trail.
