# Orchestration — fan out across screens

The conductor's parallel axis is the **screen**. A design build is `comprehend × N → theme once → build × N → style → verify × N`; the read-mostly, per-screen stages are independent and MUST be fanned out for any 2+ screen build. This is the dispatch playbook. Roles + the per-dispatch Contract A: [handoff-contract.md](handoff-contract.md). One-time session setup every dispatch inherits: [preflight.md](preflight.md).

Orchestrate the fan-out with `superpowers:dispatching-parallel-agents` (Task tool). Within a single screen's structure build, `shesha-form-edit` may itself fan out `form-author`s (its own [orchestration.md](../../shesha-form-edit/references/orchestration.md)) — that is one level down; the conductor stays at the screen axis.

## What fans out, what is a barrier

| Stage | Mode | Why |
|---|---|---|
| 1 Ingest | serial, once | one design source → one token set + screen inventory |
| **2 Comprehend** | **∥ one agent per screen** | read-only measurement, fully independent per screen |
| 3 Theme | **BARRIER, once** | app theme set once *before* any screen is styled (sequencing rule 1) |
| **4a Structure author** | **∥ one agent per screen** | distinct forms; each returns markup only |
| 4a Push | serial / central | the one gated push path (`clean-form-config` + `validate-guardrails.js`) |
| 4b Style | central | `shesha-design-system` styles centrally so the look stays coherent |
| 5 Verify | **serial** | placement probe + visual audit are browser-bound (single Playwright session) |

Cross-link ordering (list → detail → create) governs the **push + verify** sequence, not the authoring — author all screens in parallel, then push/verify in navigable order.

## Threshold

- **1 screen** → inline, no dispatch (dispatch overhead exceeds the benefit).
- **2+ screens** → MUST fan out Step 2 and Step 4a, one agent per screen, in parallel. A multi-screen build run serially is a defect, not a style choice.

## Dispatch prompt — every per-screen agent (Contract A)

A dispatched agent does NOT read this skill — the dispatch prompt is its only binding. Every dispatch MUST carry the following, or the agent re-picks a shell, re-authenticates, or pushes/styles out of contract:

> SKILL_ROOT: `<path>`. Pinned tool: **PowerShell tool only** (Windows) — never Bash. `<workdir>`: `<path>` (cached bearer token at `<workdir>/access-token` — reuse it, never re-authenticate). Screen: `<name>`. Blueprint: `<workdir>/blueprints/<screen>.blueprint.md`. Entity modelType: `<type>`. Form identity: module `<module>`, name `<name>`. **Return markup ONLY — NEVER push, NEVER style, NEVER author `columns`.** Write all scratch under `<workdir>`.

## Cost guidance — one agent per screen is the target, not a ceiling to fear

| Signal | Read |
|---|---|
| `agents_dispatched` == screen count | expected — the mandated fan-out |
| `agents_dispatched` > one per screen | waste — redundant re-dispatch or multiple authors on one screen; stop |
| a 2nd rebuild/restart cycle | waste — scan all prereqs, do ONE build |
| > 1 screenshot per screen | waste — assert via a11y snapshot |

This reconciles the ledger watch-list in [preflight.md](preflight.md): per-screen fan-out is the correct shape; the warning there is about *more than one agent per screen* and rebuild cycles — never the fan-out itself.
