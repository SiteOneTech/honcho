# Task Graph - Honcho Memory Console

Project: `honcho-memory-console`
Owner: Jean García / SitioUno
Created: 2026-06-19T01:26:24-04:00
Validated: yes
Reviewed: yes
Reviewer: Zeus Factory orchestrator bootstrap pass
Status: G1 ready for autonomous Factory execution

## Tasks

| ID | Title | Owner | Reviewer | Phase | Depends On |
|---|---|---|---|---|---|
| T00 | Validate G1 pack and repo/deployment baseline | solution-architect | factory-orchestrator | planning | none |
| T00P | Confirm canonical implementation plan and phase contract | implementation-planner | factory-orchestrator | planning | T00 |
| T01 | Backend console scaffold and secure settings/auth | claude-builder | security-reviewer | implementation | T00P |
| T02 | Honcho API and memory adapters | claude-builder | quality-reviewer | implementation | T01 |
| T03 | Agent registry and token fingerprint model | claude-builder | security-reviewer | implementation | T01 |
| T04 | Local server/service health adapter | codex-builder | devops-release | implementation | T01 |
| T05 | Premium frontend shell and design system | claude-builder | quality-reviewer | implementation | T00P |
| T06 | Agents table and agent detail UX | claude-builder | quality-reviewer | implementation | T02, T03, T05 |
| T07 | Health cockpit UX and integration | codex-builder | qa-verifier | implementation | T04, T05 |
| T08 | Memory explorer UX and integration | claude-builder | quality-reviewer | implementation | T02, T05 |
| T09 | Token/API telemetry and audit trail | claude-builder | security-reviewer | implementation | T02, T03 |
| T09S | Security review for auth, tokens, telemetry, and commands | security-reviewer | factory-orchestrator | security_review | T09 |
| T10 | Private Tailscale sandbox deploy packaging for honcho-memory-prod | devops-release | security-reviewer | deploy | T06, T07, T08, T09S |
| T11 | Browser QA, accessibility, and visual polish pass | qa-verifier | quality-reviewer | qa | T10 |
| T11Q | Independent quality review of console UX/code | quality-reviewer | factory-orchestrator | quality_review | T10 |
| T11B | Post-deploy browser/API health verification | qa-verifier | quality-reviewer | qa | T10, T11 |
| T12 | Final delivery report and runbook update | factory-reporter | factory-orchestrator | delivery | T11, T11Q, T11B |

## Dispatch Rules

- Implementation tasks must read `DOCUMENTATION_INDEX.md` first.
- Implementation tasks use phase `implementation` so Factory recognizes the runnable build contract.
- Quality, security, browser QA, sandbox deploy, post-deploy verification, and delivery report are distinct tasks.
- Do not expose raw secrets or raw tokens.
- Do not deploy until security review for auth/redaction passes.
- UI tasks require browser QA evidence before delivery.
- If any required secret is missing, block with a concrete Infisical secret name.
