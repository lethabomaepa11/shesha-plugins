---
name: shesha-claude-designer
description: Use as the ENTRY POINT when the user wants a Shesha app/page/form to MATCH a design they have — a wireframe, an HTML/JSX prototype, a runnable app, a Figma-style kit, or a screenshot set — and asks to realise it in Shesha. Triggers like "build this design in Shesha", "make Requirements Studio look like the Claude design", "turn this prototype into Shesha forms", "implement this mockup across the app". It is the conductor across one or more screens, it comprehends the design into measured layout blueprints, then orchestrates shesha-design-comprehension, shesha-form-edit and shesha-design-system, and verifies the result by measurement. For a single isolated form with no design source, go straight to shesha-form-edit (it ends with a mandatory default-shesha-theme styling pass, so the result is still styled); to style an already-working form, go straight to shesha-design-system.
---

# Shesha Claude Designer

**The conductor for design → on-brand Shesha app.** It does not author form JSON or pick colours — it ingests a design, turns each screen into a **measured layout blueprint**, plans the screens, and delegates: structure to `shesha-form-edit`, styling to `shesha-design-system`, comprehension + placement verification to `shesha-design-comprehension`. Roles, contracts, session pre-flight, and the fan-out map live in **[references/conducting.md](references/conducting.md)**.

Pipeline: `pre-flight → ingest + tier detect → comprehend (∥ per screen) → theme once + plan → build (∥ per screen) + style → verify (structure · PLACEMENT · visual)`, with placement/visual mismatches routed back to the builder (capped).

## Steps

### Step R — Route by weight (always first, before pre-flight)

This skill is often invoked as a blanket entry point (harnesses, muscle memory) for tasks that don't need a conductor. **Route before paying for the pipeline:**

- **Single screen + NO design source** (the "design" is prose adjectives — "modern", "clean", "professional" — with no prototype/kit/screenshot files): **hand the ENTIRE task to `Skill(shesha-developer:shesha-form-edit)` and stop conducting.** Its pipeline ends with the mandatory default-theme styling pass, so the result ships styled. No comprehension, no blueprint, no brand tokens, no three-gate verify — form-edit's own browser smoke is the verification. Conducting a one-screen prose build through the full pipeline is the measured #1 cause of 30+ minute runs form-edit finishes in ~8.
- **Single trivial edit** ("add a checkbox/button/field to X"): same — straight to `shesha-form-edit` (it scales itself down further).
- **Single screen + a REAL design source** (files to measure): run this pipeline, comprehension inline (no dispatch), placement gate on that one screen.
- **2+ screens, or a design kit/prototype covering an app**: full pipeline with per-screen fan-out.

When routing away, pass the full task context (backend URL, credentials, module, working dir) and let `shesha-form-edit` own the run end-to-end, including the result summary.

### Step 0 — Pre-flight (once per session)
Pin one shell, define one `<workdir>`, auth once (cached BOM-free token), resolve the skill root once, one scoped metadata fetch per entity, one consolidated confirmation gate, keep the per-phase cost ledger. Checklist: [conducting.md §Pre-flight](references/conducting.md); the underlying session rules: `shesha-form-edit/references/contracts.md`.

### Step 1 — Ingest the design
Identify the source and its **fidelity tier**: readable source (un-minified HTML/JSX/kit — read tokens + components directly) · runnable prototype (**serve it over HTTP and probe it — never parse a minified/offline bundle statically**) · screenshots/PDF/Figma exports (read images; markitdown for content/label outlines ONLY — it flattens layout, never read its output as placement). Extract the **token set** (palette, type, spacing, radius, shadow, status lifecycle → a `shesha-design-system` theme file) and the **screen inventory** (name, type, entity, chrome notes) — not column-level layout; that is comprehension's job.

### Step 2 — Comprehend each screen into a layout blueprint  ← the placement spine
**REQUIRED SUB-SKILL `shesha-developer:shesha-design-comprehension`**, one agent per screen dispatched in parallel (2+ screens = MUST; see the fan-out map + Contract A in [conducting.md](references/conducting.md)). Produces `<workdir>/blueprints/<screen>.blueprint.md` — measured grid/nesting/tabs/bindings + a placement `assertions` block. Never hand `shesha-form-edit` a prose brief instead. **Name regions with the canonical archetypes** from `shesha-design-system/references/default-layout-patterns.md` (read before comprehension) — build to the pattern's anatomy, measure only where the design genuinely deviates; where the design is silent, default to those patterns.

### Step 3 — Establish the theme (once) + plan the screens
Brand selection: user-named brand / handed tokens / existing `<brand>.tokens.json` → use it; distinct palette in the design → author a new token file (copy the default, swap values); otherwise the shipped **default `shesha`** brand (rules in `shesha-design-system` Step 1). Hand the token set to `shesha-design-system` to set the app-level theme **once**. Map each screen to `{archetype, blocks[], recipes[]}` (blocks from `shesha-form-edit/assets/blocks`, overlays from `shesha-design-system`); sequence the build (list → detail → create). Present plan + blueprints + cost; gate once (unless headless).

### Step 4 — Build each screen (delegate)
Fan out structure authoring — one agent per screen, in parallel, each under Contract A (returns markup ONLY). Serial barriers: theme before any styling, ONE gated push path, central styling, serialized browser verify. Per screen:
- **(a) Structure — `shesha-developer:shesha-form-edit`:** the blueprint is the requirements; it builds native structure, wires CRUD, validates, pushes, publishes.
- **(b) Styling — `shesha-developer:shesha-design-system` ONLY:** applies the theme's per-component v7 blocks; returns styled JSON; `shesha-form-edit` owns the push. **Never** have form-edit or a `form-author` agent style — a styling prompt to an authoring agent is a contract violation.

### Step 5 — Verify against the design (three gates, in order)
- **5a — Structural integrity:** archetype built, native components only, fields bound. Failures → back to `shesha-form-edit`, not on to styling.
- **5a.5 — PLACEMENT diff (REQUIRED `shesha-design-comprehension`):** re-probe the built, published, table→details-navigated form; diff measured placement against the blueprint `assertions`; route concrete fixes back. **Cap: 2 routed-fix iterations per screen, then a placement report** (the comprehension verification loop). Record the saved probe `*.layout.json` path per screen — no recorded probe = not "done".
- **5b — Visual audit (BLOCKING):** render every screen in the **adminportal** (`publicportal` only for `access: 5`) via the playwright skill; capture ONE final screenshot + console/network errors per screen; `shesha-design-system` audit-mode returns prop-level fixes. **Cap: 2 fix cycles; every browser wait ≤ 20 s with a timeout branch** (`shesha-form-edit/references/verification.md`). If the frontend isn't running, report **"built but NOT visually verified"** — never "done". Structural API checks never substitute for looking at the rendered form.

### Step 6 — Confirm
Summarise per screen (form id, blueprint pass/fail, theme applied); cross-link screens (list→detail→create). Headless: ONE aggregate result envelope for the whole run.

## Non-negotiables — conduct, don't build

- **Comprehend before building** — every screen gets a measured blueprint before `shesha-form-edit` is invoked; prose layout descriptions drift.
- **Placement AND visual are BLOCKING gates — and both are CAPPED** (2 iterations / 2 cycles, waits ≤ 20 s). An honest partial-match report beats an unconverging loop — uncapped verify loops and hung waits are the measured top causes of 40–90 min runs.
- **Delegate ownership, never mis-route it** — structure = `shesha-form-edit`; styling = `shesha-design-system` ONLY; comprehension/placement = `shesha-design-comprehension`. This skill plans, sequences, gates.
- **One push path, fully gated; agents return markup only** — the dispatch contract and session rules are canonical in `shesha-form-edit/references/contracts.md`; every dispatch carries Contract A ([conducting.md](references/conducting.md)).
- **Read the source, not the bundle** — serve/run compiled prototypes; never parse minified single-file bundles.
- **Set up once, propagate everywhere** — pre-flight state (shell, workdir, token, skill root) is handed to every dispatch; repeating setup per screen is the main avoidable cost.
- **Fan out across screens (MUST for 2+)** — one agent per screen for comprehension and authoring; barriers stay serial ([conducting.md](references/conducting.md)).
- **Honesty about gaps** — if a design detail can't be expressed in Shesha, say so; never claim an unachievable pixel match.

## Relationship to the other skills

| Concern | Skill |
|---|---|
| **Ingest design, plan screens, orchestrate, verify end-to-end** | **this skill** |
| Comprehend design → measured blueprint + placement verification | `shesha-developer:shesha-design-comprehension` |
| Build structure, CRUD, validate, push | `shesha-developer:shesha-form-edit` |
| Map tokens → app theme + per-component v7 style blocks | `shesha-developer:shesha-design-system` |
