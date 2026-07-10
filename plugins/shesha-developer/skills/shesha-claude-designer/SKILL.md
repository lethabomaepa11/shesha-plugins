---
name: shesha-claude-designer
description: Use as the ENTRY POINT when the user wants a Shesha app/page/form to MATCH a design they have — a wireframe, an HTML/JSX prototype, a runnable app, a Figma-style kit, or a screenshot set — and asks to realise it in Shesha. Triggers like "build this design in Shesha", "make Requirements Studio look like the Claude design", "turn this prototype into Shesha forms", "implement this mockup across the app". It is the conductor across one or more screens, it comprehends the design into measured layout blueprints, then orchestrates shesha-design-comprehension, shesha-form-edit and shesha-design-system, and verifies the result by measurement. For a single isolated form with no design source, go straight to shesha-form-edit (it ends with a mandatory default-shesha-theme styling pass, so the result is still styled); to style an already-working form, go straight to shesha-design-system.
---

# Shesha Claude Designer

## Overview

**The conductor for design → on-brand Shesha app.** It does not author form JSON or pick colours — it ingests a design, turns each screen into a **measured layout blueprint**, plans the screens, and delegates: structure to `shesha-form-edit`, styling to `shesha-design-system`, and the placement comprehension + verification to `shesha-design-comprehension`. Its job is to make sure the built app *matches the design* — in layout (measured, not eyeballed) and in brand.

```dot
digraph { rankdir=LR;
  pre [label="0 pre-flight\n(auth once · shell · workdir)"];
  d [label="Claude design\n(source)"];
  ingest [label="1 ingest +\ntier detect"];
  comp [label="2 comprehend\n→ blueprints"];
  plan [label="3 plan screens"];
  build [label="4 build (form-edit)\n+ style (design-system)"];
  verify [label="5 verify:\nstructure · PLACEMENT · visual"];
  pre -> d -> ingest -> comp -> plan -> build -> verify;
  verify -> build [label="placement/visual\nmismatch → fix"];
}
```

## When to use

- A design source exists (prototype / kit / screenshots / runnable app) and the goal is to realise it in Shesha across one or more screens.
- **Not** for "add a field to this form" (use `shesha-form-edit`) or "just theme this working form" (use `shesha-design-system`).

## Steps

### Step 0 — Pre-flight (once per session)  ← do this before anything else
A design build fans out into many sub-skill calls; the cheap win is doing the shared setup **once**. Before ingesting: pin one shell (PowerShell on Windows, bash elsewhere) and define a single `<workdir>`; **authenticate once and cache the token** to `<workdir>/access-token` for every sub-skill to reuse (never re-auth per screen, never inline the raw JWT); resolve the plugin skill root once; plan to fetch each entity's metadata once (scoped `GetProperties`, distilled); consolidate to a single confirmation gate; and keep a per-phase cost ledger. Full checklist: [references/preflight.md](references/preflight.md). This is what stops auth, path-guessing, metadata, and skill-hunt costs from repeating on every screen.

### Step 1 — Ingest the design
Identify and read the design source; detect its **fidelity tier** (readable source / runnable app / screenshots). Extract the **token set** (palette, type, spacing, radius, shadow, status lifecycle) and the **screen list**. Normalise mixed docs with markitdown for content only. Details: [references/design-ingestion.md](references/design-ingestion.md). Do NOT parse a compiled/offline single-file bundle — serve+run it instead.

### Step 2 — Comprehend each screen into a layout blueprint  ← the placement spine
**REQUIRED SUB-SKILL:** `shesha-developer:shesha-design-comprehension`. For each screen, it produces `<workdir>/blueprints/<screen>.blueprint.md` — a measured, annotated layout blueprint with explicit grid columns/spans, nesting, tab assignment, bindings, and a placement `assertions` block. This is what stops container placement from drifting; do not skip it and hand `shesha-form-edit` a prose brief.

**Interpret with the canonical archetype vocabulary.** Read `shesha-design-system/references/default-layout-patterns.md` before comprehension — record bars, KIB strips, 44px-uppercase-header tables, ghost-Add toolbars, item-list cards, flat hairline cards with header strips, underline tabs, right-aligned modal footers. When a design region matches one of those shapes, name it as that pattern in the blueprint (and build it to the pattern's anatomy) instead of re-deriving it from pixels; measure from the design only where it genuinely deviates. Where the design is silent (a screen the mockups don't cover), default to these patterns — never to bare unstyled structure.

### Step 3 — Establish the theme (once) + plan the screens
**First decide the brand.** If the user names a brand, hands over brand tokens, or an app-specific `<brand>.tokens.json` already exists → use that. If the design carries a distinct palette/type → author a new `<brand>.tokens.json` (copy the default, swap values). Otherwise → use the shipped **default `shesha`** brand. The selection rule + the folder to drop a custom brand file into live in `shesha-developer:shesha-design-system` (SKILL.md Step 1). Then hand the token set to `shesha-developer:shesha-design-system` to ensure the brand theme file exists and the app-level theme (primary, font, radius) is set **once**. Then map each design screen to a Shesha form type + archetype (read the archetype straight from each blueprint — don't re-derive it), **resolve each blueprint region to a block-library block** (`shesha-form-edit/assets/blocks` — e.g. `flex-split-main-rail`, `page-header-band`, `rail-panel`) **+ its paired style overlay/recipe** (`shesha-design-system`), so the per-screen plan is `{archetype, blocks[], recipes[]}`; and sequence the build order (list → detail → create is typical). Present the plan + blueprints + cost; gate on user confirmation (unless headless).

### Step 4 — Build each screen (delegate)
Per screen, in order:
- **(a) Structure — REQUIRED SUB-SKILL `shesha-developer:shesha-form-edit`:** pass the screen's `blueprint.md` as the requirements (archetype → seed/blocks, `layout-tree` spans → **flex `container` rows sized via `desktop.dimensions.width`** — never the `columns` component, `bindings` → component + propertyName). It builds native structure, wires CRUD, validates, pushes, publishes.
- **(b) Styling — REQUIRED SUB-SKILL `shesha-developer:shesha-design-system`:** apply the theme's per-component v7 style blocks to the built form. It returns styled JSON; `shesha-form-edit` owns the single push path. **Styling is produced ONLY by `Skill(shesha-developer:shesha-design-system)` — NEVER by `shesha-form-edit` and NEVER by dispatching a `form-author` (or any authoring) agent with an "apply the theme / style it" prompt.** An authoring agent hand-editing v7 style blocks bypasses the design system's token discipline, version-gating, and the single push path — it is a contract violation.

### Step 5 — Verify against the design (three gates, in order)
- **5a — Structural integrity:** archetype built, native components only, layout fully flexed, fields bound. Failures route back to `shesha-form-edit`, not on to styling.
- **5a.5 — PLACEMENT diff (REQUIRED `shesha-design-comprehension`):** re-probe the built, published, table→details-navigated form; diff measured column membership / row grouping / nesting depth / tab assignment against the blueprint `assertions`; route concrete mismatches back to `shesha-form-edit`. This is the gate that proves the build matches the design's *layout*, not just that it renders — its method lives in the `shesha-developer:shesha-design-comprehension` verification loop. **Record the saved probe `*.layout.json` path per screen as proof this gate actually ran — a screen with no recorded probe is not "done."**
- **5b — Visual audit (BLOCKING, not a suggestion):** launch the frontend and load each built form in a browser (via `Skill(skill="playwright", …)`, or delegate to `shesha-form-edit` Step 9); capture a final screenshot + console/network errors per screen. `shesha-design-system` audit-mode then returns prop-level fixes. **A design build is NOT "done" until every screen has rendered in a browser with zero console errors and been eyeballed against the theme. If the frontend is not running, you MUST report "forms built but NOT visually verified — frontend not running" and never claim the design was matched.** (Structural API checks — component counts, hex-strings-present — are necessary but never sufficient for a "looks professional" claim.)

### Step 6 — Confirm
Summarise per screen (form id, blueprint pass/fail, theme applied); cross-link screens (list→detail→create navigation).

## Non-negotiables — conduct, don't build

- **Comprehend before building.** Every screen gets a measured blueprint (Step 2) before `shesha-form-edit` is invoked. A prose layout description is the thing that drifts — never hand one to the builder in place of a blueprint.
- **Placement AND visual are BLOCKING gates, not suggestions.** Gate 5a.5 re-measures the built form against the blueprint (record the probe path as proof); gate 5b renders every screen in a browser. No screen is "done" until its placement assertions pass AND it has rendered with zero console errors. **A run that could not render the form (headless / no frontend) reports "built but NOT visually verified" — it NEVER reports "done" or "matches the design."** Structural API checks (component counts, hex-present) never substitute for looking at the rendered form.
- **Delegate ownership — and never mis-route it.** Structure = `shesha-form-edit`; **styling = `shesha-design-system` ONLY** (never `shesha-form-edit`, never a `form-author`/authoring agent — dispatching one with an "apply the theme / style it" prompt is a contract violation); comprehension + placement verification = `shesha-design-comprehension`. This skill plans, sequences, and gates — it does not author JSON, pick hexes, or push.
- **One push path, fully gated.** All writes go through `shesha-form-edit`, and every push runs its full pre-push gate — `clean-form-config` + `validate-guardrails.js` (both MUST, blocking). A dispatched agent NEVER pushes directly and NEVER styles — it returns markup for `shesha-form-edit` to gate and push. If a form reached the backend without going through that gate, the gate did not run.
- **Read the source, not the bundle.** Run/serve a compiled prototype and probe it (or read un-minified source); never parse a minified single-file bundle.
- **Honesty about gaps.** If a design detail can't be expressed in Shesha, say so — don't claim a pixel match that isn't achievable.
- **Set up once, reuse everywhere — and propagate it.** Auth once (cached token, reused by every sub-skill), one pinned shell, one `<workdir>`, one skill-root resolution, one scoped metadata fetch per entity, one confirmation gate. **Pin the shell as a TOOL-selection rule: on Windows run every command through the PowerShell tool, never the Bash tool (a PowerShell one-liner in the Bash tool fails with `=: command not found`, exit 127).** These live only in this conductor — so every dispatched sub-agent must be handed the pinned shell/tool + the `<workdir>`/token path in its Contract (see [handoff-contract.md](references/handoff-contract.md)), or it re-picks a shell and re-authenticates. Repeating any of this per screen is the main avoidable cost of a design run — see [references/preflight.md](references/preflight.md).

## Relationship to the other skills

| Concern | Skill |
|---|---|
| **Ingest design, plan screens, orchestrate, verify end-to-end** | **this skill** |
| Comprehend a design → measured layout blueprint + placement verification | `shesha-developer:shesha-design-comprehension` |
| Build correct structure, CRUD, validate, push | `shesha-developer:shesha-form-edit` |
| Map tokens → app theme + per-component v7 style blocks | `shesha-developer:shesha-design-system` |
