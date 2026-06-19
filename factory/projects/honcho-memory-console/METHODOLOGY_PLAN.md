# Methodology Plan - Honcho Memory Console

Project: `honcho-memory-console`
Owner: Jean García / SitioUno
Created: 2026-06-19T01:26:24-04:00
Validated: yes
Reviewed: yes
Reviewer: Zeus Factory orchestrator bootstrap pass
Status: G1 ready for autonomous Factory execution

## Factory Method

Use Hybrid Factory methodology with strict G0/G1 readiness before implementation.

## Roles

- Product analyst: requirements, PRD, UX acceptance criteria.
- Solution architect: architecture, data boundaries, deployment model.
- Implementation planner: task graph and sequencing.
- Claude builder: complex app implementation.
- Codex builder: bounded tests, refactors, QA fixes.
- Quality reviewer: independent spec/quality review.
- Security reviewer: auth, token redaction, command safety, secret handling.
- QA verifier: Playwright/browser evidence and deployed smoke.
- DevOps release: VM deployment, restart, rollback evidence.
- Factory reporter: delivery report and tracker updates.

## Gate Policy

- G0 repo strategy: passed by this intake pack.
- G1 documentation: must be committed and validated/reviewed before implementation tasks run.
- Implementation gate: each code task must commit and run relevant tests.
- Quality gate: independent diff review before deployment.
- Security gate: required before deployment because tokens/secrets/VM health are involved.
- Test gate: unit/API tests plus browser/Playwright smoke.
- Delivery gate: deployed URL, service status, rollback notes, and screenshots/evidence.

## Execution Strategy

1. Build backend aggregator and tests.
2. Build frontend shell/design system and static states.
3. Connect real endpoints for agents, memory, and health.
4. Add telemetry/token fingerprint support if missing.
5. Harden auth/security/audit.
6. Deploy to `honcho-memory-prod`.
7. Run browser QA and produce final delivery report.

## Review Standards

- No fabricated metrics.
- No raw secrets in UI/logs/tests.
- All data must be real or explicitly marked unavailable.
- UI must be visually inspected in browser, not just unit-tested.
- Workers must include commands and real outputs in final task responses.
