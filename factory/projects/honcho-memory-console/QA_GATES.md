# QA Gates - Honcho Memory Console

Project: `honcho-memory-console`
Owner: Jean García / SitioUno
Created: 2026-06-19T01:26:24-04:00
Validated: yes
Reviewed: yes
Reviewer: Zeus Factory orchestrator bootstrap pass
Status: G1 ready for autonomous Factory execution

## Required Checks

### Static and Unit

- Backend unit tests for adapters and redaction.
- Frontend type check/lint/build.
- API contract tests for `/api/overview`, `/api/agents`, `/api/health/services`, memory endpoints.

### Integration

- Backend can call local Honcho API health endpoint.
- Backend returns real `hermes` workspace data.
- Service health adapter returns actual docker/systemd state on VM or local test fixture with clear label.

### Browser QA

- Open deployed console through Tailscale.
- Verify login/auth boundary.
- Verify Overview, Agents, Agent detail, Memory, Health pages.
- Confirm dark/light mode if implemented.
- Confirm responsive layout at desktop and mobile widths.
- Capture screenshot or Playwright trace evidence.

### Accessibility

- Keyboard navigation for main nav and table rows.
- Focus states visible.
- Button/table contrast passes WCAG AA.
- Loading, empty, and error states are present.

### Visual Quality

- No generic template dashboard.
- Agents table is readable and dense.
- Health view groups services by operational layer.
- No raw JSON as default UX.
- No fake metrics unless explicitly marked as fixture in dev mode only.

## Acceptance Evidence

Each QA task must record:

- command run;
- actual output summary;
- URL tested;
- screenshot/trace path if browser QA;
- commit SHA;
- unresolved risks.
