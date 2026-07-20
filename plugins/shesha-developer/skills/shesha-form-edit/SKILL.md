---
name: shesha-form-edit
description: Create and edit Shesha form configurations directly via the API. Authenticates as admin, fetches existing markup with Get/GetByName/GetJson, applies the user's requirements (adding, removing, modifying, or restructuring components — or building a brand-new form from scratch), validates against the bundled component-properties index and embedded-script rules, and pushes via Create / UpdateMarkup / ImportJson. Use when the user provides a form id (or module + name) and a set of requirements like "add a sector dropdown above the email field", "make the address tab conditional on AccountType=PBF", "wire the Save button to call /api/.../Submit", or "create a new branded login page using the auth-login pattern". Always prefer this skill over the Shesha MCP `create_form_configuration` tool — the MCP regularly fails with `'dict' object has no attribute 'lower'` and JSON-RPC `-32602` errors, and the direct-API path is more reliable. Finishes every new no-design form with a mandatory default-theme styling pass (shipped `shesha` tokens via shesha-design-system) — a form built with no design source still comes out styled.
allowed-tools:
  - Bash
  - PowerShell
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - AskUserQuestion
  - WebFetch
  - Skill
  - Task
---

# Shesha Form Edit

Round-trip: **GET form JSON → edit → PUT/POST it back**. Also creates new forms (`Create` then `UpdateMarkup`).

> **New table / list / create / detail form? Compose from `assets/blocks/`, else copy a canonical seed from `assets/examples/`** ([references/examples.md](references/examples.md)). "table"/grid ⇒ `datatable`, "list"/cards ⇒ `datalist` ([data-tables.md](references/components/data-tables.md)). The seeds encode the CRUD wiring most builds get wrong (modal Add via `Show Dialog`, in-place `Start Edit`/`Submit` detail lifecycle, child tables as `tabs` + `permanentFilter`). Copy, swap entity/properties/captions/`formId`s, re-stamp `parentId`s, push.

> **Requirements arriving as a layout blueprint** (`<screen>.blueprint.md` from `shesha-design-comprehension`, usually via `shesha-claude-designer`)? The blueprint is the structure spec — archetype picks the seed, `layout-tree` drives the flex splits + `parentId`s, `bindings` drive `propertyName`s; expect a placement re-measure against its `assertions`. See [references/blueprint-consumption.md](references/blueprint-consumption.md).

Args: `$ARGUMENTS`. Flags: `--refresh-cache` (ignore TTL, re-distill metadata/seeds), `--no-browser` (skip Step 9 browser smoke), `--no-style` (skip the Step 6.5 default-theme pass — the only thing that skips it).

## Non-interactive (headless) runs — read this first

When invoked non-interactively (`claude -p`, a test harness, CI) or when the task supplies a context block (Backend URL / Username / Password / Module / Working directory): **never call `AskUserQuestion` — it dead-ends the run.** Use the supplied context verbatim — it **overrides** Step 1 URL discovery, Step 2 default credentials, and the target module. Defaults for every ask-gate: Step 6.5 default-theme pass → **always runs** (it never asks); Step 3 missing form identity → resolve from the task wording against the module's form list (`GetAll`), else create a new form named `{entity-kebab}-{type}` in the context module; push-failure menu → re-fetch & re-apply once, then stop and report. **Always end with a summary naming every form created or modified (module + name + id)** — downstream evaluation identifies your work from that output.

## Step R — Scale the effort to the request (always first)

Match process weight to the task; **default down** when unsure:

- **Small edit** (one component/prop/script/action on an existing form) → inline, Steps 1–8 only; browser check (Step 9) only if the change is visual/behavioral.
- **One whole form** → inline, full Steps 1–10 **including Step 6.5**, blocks/seed-first.
- **Backend prereqs may be missing** (entity/property/reflist/API) → gate on Step 4.5 BEFORE writing form JSON.
- **Multiple linked pages / whole app** → plan first, build in waves (create → details → table, then cross-link) per [references/orchestration.md](references/orchestration.md); track every form in `<workspace>/form-manifest.json` — later forms are where styling/verification silently drops. Fleet mode past ~3 forms; state rough cost up front. >3 forms changed → read [references/bulk-operations.md](references/bulk-operations.md) first (pilot-first mandatory; mutations via ONE `fleet-transformer`, audits via `form-auditor` fan-out).

**Route OUT non-form work** — a pure backend ask (reference list, role, notification, background job, API) goes straight to the sibling skill.

**Styling authoring is not this skill's job — TRIGGERING it is.** This skill builds structure + CRUD wiring; appearance belongs to `shesha-developer:shesha-design-system` (a structural build never reads styling docs or authors v7 appearance blocks). The styling pass happens either via the mandatory Step 6.5 default-theme pass (no brand/design supplied) or via the explicit design-system handoff when the request is "make it match X / style it / apply our brand". The ONE layout concern kept here: **structural splits are flex `container` rows — never `columns`** (sizing per generation: [references/renderer-physics.md](references/renderer-physics.md)).

## Step 1 — Resolve backend URL

Task-supplied context wins → `src/*.Web.Host/Properties/launchSettings.json` → `appsettings.json` (`Kestrel:Endpoints:Http:Url`) → fallback `http://localhost:21021`. Strip trailing slash → `$BASE_URL`. Ping `$BASE_URL/swagger/index.html`; if unreachable, stop and tell the user to start the backend.

## Step 2 — Authenticate as admin

Task credentials win; else `admin`/`123qwe` — don't ask. `POST $BASE_URL/api/TokenAuth/Authenticate` → `result.accessToken`. **Auth once, cache the token BOM-free, reuse on every call, never inline the JWT** — full session rules: [references/contracts.md](references/contracts.md). If no token, surface the raw response and stop.

**Module ID lookup** (needed for `Create`): `GET $BASE_URL/api/services/app/Module/GetAll` (`app` namespace — `Shesha/Module/GetAll` 404s); cache the id. If a later `Create` returns `"There is no entity Module with id"`, the backend restarted and the ID changed — re-fetch.

## Step 3 — Identify the form

Required: form id OR (module + name) — ask only for what's missing. Resolve names via `GetByName` ([api.md §3](references/api.md)) → `$FORM_ID`.

**Version-aware resolution:** if the response carries `versionNo` + `versionStatus`, this is a versioned (0.43-class) backend — record both and run the **in-flight-draft lookup** (`GetAll` + `IsLast==true`) before planning any edit: an existing Draft/Ready for the same Origin is **reused**, never duplicated. Full flow: [references/version-lifecycle.md](references/version-lifecycle.md).

## Step 4 — Fetch the current markup

`GET /api/services/Shesha/FormConfiguration/GetJson?id=$FORM_ID` ([api.md §4](references/api.md)); save under the session workdir (never `/tmp` — [contracts.md §3](references/contracts.md)). Parse: top-level `components` (nested tree) + `formSettings`.

## Step 4.5 — Entity introspection (mandatory for entity-bound forms)

Skip only if `formSettings.dataLoaderType === "none"`. The full contract is **[references/entity-binding.md](references/entity-binding.md)** — read it. In one line each:

1. **Probe first**: run `scripts/backend-probe.mjs` before any hand-rolled round-trips.
2. **Resolve `modelType` from the live `EntityConfig`** (object on 0.45, string on 0.43); never assume a namespace; note the portability rule for forms that will run on other projects.
3. **Entity existence = evidence before create**: a 404 is never proof; only an empty 200 property array is — and creating an entity requires the printed evidence block (the 20–60 min branch).
4. **Metadata-availability gate (BLOCKING)**: no metadata → no entity-bound or reflist-bound component, period.
5. **Validate every `propertyName`** (camelCase) and **copy every reference-list identity verbatim from metadata**.
6. **Any domain change → rebuild + restart per [references/backend-restart.md](references/backend-restart.md)** (scan-once-build-once; two boots for new entities) BEFORE building the form.

For a NEW entity-bound form or an unverified entity this session: dispatch `shesha-developer:fullstack-prereq-checker` (backend URL, token-file path, entity list) and block until `ready`. Backend-rooted symptom catalog: [references/full-stack-prereqs.md](references/full-stack-prereqs.md).

## Step 5 — Apply the requirements

Read **only** the topic files the edit touches (1–3 for most edits):

| Topic | File |
|---|---|
| Form skeleton, component plan + `stampTree`, loader/submitter choice | [components/form-shape.md](references/components/form-shape.md) |
| Inputs, validation, uploads · component per data type | [inputs.md](references/components/inputs.md) · [by-datatype.md](references/components/by-datatype.md) |
| Dropdowns / reflists · autocomplete, entityPicker | [dropdowns.md](references/components/dropdowns.md) · [selectors.md](references/components/selectors.md) |
| Containers, card, flex splits, tabs (structure only) | [containers.md](references/components/containers.md) |
| Buttons, links, action wiring | [actions.md](references/components/actions.md) |
| Datatable vs datalist, dataContext, table-vs-list decision | [data-tables.md](references/components/data-tables.md) |
| Child tables · junction M:M subtables · add/create dialogs | [child-tables.md](references/components/child-tables.md) · [junction-subtables.md](references/components/junction-subtables.md) · [add-dialogs.md](references/components/add-dialogs.md) |
| Inline-editable datatables | [inline-editable-tables.md](references/components/inline-editable-tables.md) |
| Embedded scripts · shared state (appContext/pageContext) | [scripts.md](references/components/scripts.md) · [shared-state.md](references/components/shared-state.md) |
| editMode / visibility / permissions | [edit-mode.md](references/components/edit-mode.md) |
| Version-conditional render facts (0.43 vs 0.45) — read before ANY styling/layout work | [renderer-physics.md](references/renderer-physics.md) |
| Renderer gotchas (read-only-from-versionless, code-mode hidden, anonymous forms, backend bootstrap) | [modern-renderer-gotchas.md](references/modern-renderer-gotchas.md) |
| Detail-page structure/nav anatomy · page layout patterns | [detail-page-pattern.md](references/components/detail-page-pattern.md) · [layout.md](references/components/layout.md) |
| Form quality floor + grading | [form-quality.md](references/form-quality.md) |
| Navigation/menu wiring | [navigation-menu.md](references/navigation-menu.md) |
| **Visual styling / appearance** | do NOT read during a structural build — `Skill(shesha-developer:shesha-design-system)` |

**Authoring path: [components-kb.md](references/components-kb.md) → [block-library.md](references/block-library.md) → lean seed** — the KB quick-shapes replace seed-reading for common shapes; the block library composes vetted blocks (~600 lines, correct-by-construction); seeds are the fallback. **The big seeds are read-traps: NEVER read one wholesale** — `Grep` one fragment with tight `-A/-B`. On a 0.43-class backend use the `assets/examples/043/` variants (regenerate via `node scripts/adapt-seed-to-043.js --all`; never hand-edit `043/`). Remaining discovery order: `assets/patterns/` (see [examples.md](references/examples.md)) → `.claude/cache/shesha-form-edit/seeds/` → MCP `search_forms` → from scratch.

**Before writing any component JSON, run the component plan + `stampTree` procedure in [form-shape.md](references/components/form-shape.md)** — list types, confirm each against the KB, stamp `parentId`s.

**Unfamiliar mechanism** (wizard, OTP, custom action chaining)? `WebFetch` the `shesha-grads.vercel.app` / `docs.shesha.io` page BEFORE writing scripts; distill to `.claude/cache/shesha-form-edit/docs/<topic>.summary.md`.

## Step 5.5 — Pre-push JSON safety check (mandatory)

```js
const str = JSON.stringify(markup);
JSON.parse(str);                                   // must not throw
JSON.parse(JSON.stringify({ markup: str }));       // round-trip
```

Failures come from template literals or literal newlines in script strings — replace with concatenation / `\n`.

## Step 6 — Validate (all gates blocking)

1. Walk tree: unique UUIDs, valid types, valid parent chain, runtime-type checks (booleans not `"true"`), `node --check` each script string.
2. **Migration-safety checks** — every component has an integer `version`; no non-string `defaultValue`; datatable `editComponent`/`createComponent` is `[not-editable]` or `{type, settings:{…}}` (never `[default]`, never flat); `checkboxGroup` options in `items`. (Each of these passed review yet crashed a live form — details in [non-negotiables.md](references/non-negotiables.md).)
3. Run the **[form-quality floor](references/form-quality.md)**.
4. `Skill(skill="shesha-developer:clean-form-config", args="<path>")` — ONCE, on the finished markup (not per intermediate edit). Known false positives (do not strip): dataContext data props, container `direction`/`flexDirection`, `text.padding`, datatable inline props, `dimensions.minHeight`.
5. `node <skill-root>/scripts/validate-guardrails.js <form.json> <cached metadata .raw.json>` — **always pass the metadata arg** (without it the reflist check downgrades to a warn). Zero `fail` findings before push.
6. **Reference-list existence + items gate**: every bound reflist exists with ≥1 item ([entity-binding.md §5](references/entity-binding.md)).

Never push a config that fails validation without user confirmation. >3 forms changed → `form-auditor` fan-out first ([orchestration.md](references/orchestration.md)); never push a `fail` verdict.

## Step 6.5 — Default-theme styling pass (mandatory)

**No form ships unstyled.** For any new form or major restructure with no brand/design supplied (and the run did not arrive from `shesha-claude-designer`):

```
Skill(skill="shesha-developer:shesha-design-system", args="apply the default shesha theme quick pass per references/default-theme-quickpass.md to <path>")
```

**This pass hands the styled markup back to you — it is not the end of the task.** `shesha-design-system` runs here as an in-context step, so its closing line ("returning the styled markup for the push step") is a *handback into Step 7*, not task completion — it is easy to mistake that phrasing for "done" and exit with a validated file that was never pushed (a real failure mode: a form that only ever existed on disk). A validated JSON file is scaffolding; the form does not exist until Step 7 pushes it. So: after styling, **control continues to Step 7 — always.**

Merge the returned styled JSON so Step 7 stays ONE push; re-run Step 5.5 on the merged result. Never asks a question (headless-safe); only `--no-style` skips it. Exempt: small edits, and orchestrator runs (its styling step owns appearance). A named brand supersedes this with the explicit design-system handoff — same mechanism, different token file.

## Step 7 — Push

**The deliverable is a form on the backend, not a file on disk.** A build run that ends with a validated local JSON and no successful push has failed — even when every gate above passed green. Concretely: finishing a build with **zero forms created/modified on the backend** means this step was skipped, so go push before you report anything. The one exception is an edit that genuinely changes nothing, and that still says so explicitly. (This is the exact signal the harness reads — it identifies your work from what actually lands on the backend, not from a local file path.)

**Version-gated (check BEFORE any write):** on a versioned backend (Step 3 found `versionStatus`) the push follows the **[version lifecycle](references/version-lifecycle.md)** — Live(3) → `CreateNewVersion` once → `UpdateMarkup` the new Draft → publish `UpdateStatus` 1→2→3 → clear the FE cache; an in-flight Draft/Ready is reused (never a second Draft); Retired/Cancelled are never written; brand-new = `Create` → `UpdateMarkup` → publish; **one Draft per edit session**, ending Live or Cancelled.

Non-versioned backends (no `versionStatus`, e.g. 0.45 test builds): direct `PUT …/FormConfiguration/UpdateMarkup` with `{ id, markup: "<stringified JSON>" }` — build the body in Node ([api.md §5](references/api.md)). Alternative: `ImportJson` multipart ([api.md §6](references/api.md)).

All scratch under `$WORKDIR`; one combined fetch→mutate→push script beats many probes — [contracts.md §3](references/contracts.md).

**On push failure (non-200):** surface the raw response + a short diagnosis; ask retry / re-fetch & re-apply / abort (headless: re-apply once, then stop). Never silently retry. Versioned backends recover lifecycle-aware ([version-lifecycle.md §Failure recovery](references/version-lifecycle.md)) — retry `UpdateStatus` on the SAME Draft or `CancelVersion` it.

## Step 8 — Verify

Re-fetch and diff against what you sent ([verification.md §1](references/verification.md) — the 200 alone proves nothing). On versioned backends confirm the lifecycle landed (new `versionNo`, old Live retired — diff against the NEW id). After create+publish, clear the FE IndexedDB stores from a static page. Anonymous forms: confirm `access === 5` stuck (re-push once if not).

## Step 8.5 — Diagnose common runtime errors

| Error | Likely cause |
|---|---|
| 400 on dataContext load | entity lacks GQL query API → `domain-model`, or use `sourceType: "Url"` |
| 404 metadata / 500 dataContext | wrong `modelType` / missing `entityType`+`sourceType` → [entity-binding.md](references/entity-binding.md) |
| Blank form, no error | short ids / missing parentIds → re-run `stampTree` |
| Browser shows old markup after a 200 push | IndexedDB cache → [verification.md §2](references/verification.md) |

Full catalog (~40 symptom rows, incl. editMode/read-only, empty dropdowns, junction 500s): **[references/debug.md](references/debug.md)** — consult it before guessing; quote the captured error verbatim.

## Step 9 — Browser smoke (default; `--no-browser` opts out)

`Skill(skill="playwright", args="<directive from api.md §12 with FRONTEND_URL + form path>")` — load the form, capture console + network errors JSON validation can't catch. **Target the `adminportal`** (dev port from `adminportal/.env*`; `publicportal` only for `access: 5` forms). If it isn't running, report "NOT visually verified — adminportal not running", never silently pass. Test `*-details` via the table row's view link, never a pasted `?id=` ([verification.md §3](references/verification.md)).

**Cost discipline (this is where runs blow up):**
- Assert with the a11y snapshot + `getBoundingClientRect`/`getComputedStyle`, **not screenshots** — at most ONE screenshot, at the very end.
- Batch all DOM measurements into a single `evaluate` call.
- **Wait budget: no scripted wait over 20 s, deadline + timeout branch on every wait loop, one retry then report.** Fix loops cap at **2 cycles** ([verification.md §6](references/verification.md)) — after the second failed re-push, stop and report what's still failing.
- Check whether the layout question is already answered by [renderer-physics.md](references/renderer-physics.md) / a recipe before reaching for the browser.

On any captured error: [references/debug.md](references/debug.md) first, then `superpowers:systematic-debugging` before proposing fixes.

## Step 10 — Confirm

Report: form `$FORM_ID` updated; authenticated forms render at `/dynamic/<module>/<form>`, anonymous at `/no-auth/<module>/<form>`. (Headless: the mandatory summary of every form touched.)

## Cache (`.claude/cache/shesha-form-edit/`)

Project-scoped learning state: `metadata/`, `seeds/`, `docs/`, `_archive/`. Read `.summary.md` files by default, raw JSON only when insufficient (`node scripts/summarize.js <input> [--out]`). TTLs: metadata 24 h; seeds invalidate on `versionNo` change; `--refresh-cache` overrides.

## Non-negotiables — always-on floor

One-liners; the full list with the failure each rule prevents is **[references/non-negotiables.md](references/non-negotiables.md) — read it before authoring**. Step 6's validator enforces the render-killers mechanically regardless.

- **`parentId` on every component** (root → `"root"`, via `stampTree`) and **`id` is a real UUID** — missing either renders blank.
- **Every component carries its current integer `version`** (from the KB for the target generation) — stale/absent versions crash migration or silently drop the style block.
- **Action buttons live in ONE `buttonGroup`** — Save = `{ actionName: "Submit", actionOwner: "shesha.form" }`; every Submit has a paired exit button.
- **`validationErrors` present** whenever any input is required.
- **camelCase `propertyName`s** everywhere (PascalCase renders blank).
- **Reference-list identity copied from metadata, never derived; `modelType` resolved live, never assumed** — [entity-binding.md](references/entity-binding.md).
- **Splits are flex `container` rows, never `columns`**; child sizing per generation ([renderer-physics.md](references/renderer-physics.md)).
- **Mustache `{{double braces}}`; scripts JSON-safe** (no template literals/newlines), `try/catch` + `async/await`.
- **`editMode` per form type** — never blanket-stamp ([edit-mode.md](references/components/edit-mode.md)).
- **No form ships unstyled** (Step 6.5; only `--no-style` skips).
- **One gated push path** — `clean-form-config` + `validate-guardrails.js` before every push; versioned backends via the lifecycle; session rules in [contracts.md](references/contracts.md).
- **A build isn't finished until Step 7 pushes and Step 8 re-fetches it** — a validated local file is not a delivered form. Stopping after the Step 6.5 styling pass (its handback reads like "done" but isn't) or after validation means the push was skipped. Likewise a form bound to an entity that doesn't yet exist isn't "design-complete" — resolve the entity gate (below) first, don't rationalise around it.
- **API namespace is per-service** — `FormConfiguration` under `/services/Shesha/`; `Metadata`/`Module`/`EntityConfig`/`ReferenceList` under `/services/app/`. A 404 is usually the wrong namespace.

## Required skill & agent invocations

| Trigger | Invoke | Strength |
|---|---|---|
| Entity/property/reflist missing (per evidence gate) | `shesha-developer:domain-model`, then the [backend-restart.md](references/backend-restart.md) runbook | MUST before any form push |
| New entity-bound form / unverified entity | `shesha-developer:fullstack-prereq-checker` agent | MUST (block until `ready`) |
| Custom (non-dynamic) endpoint needed | `shesha-developer:shesha-app-layer` | MUST before wiring |
| Every push | `clean-form-config` + `scripts/validate-guardrails.js` | MUST (zero `fail`) |
| New form, no brand named | design-system default-theme quick pass (Step 6.5) | MUST |
| >3 forms changed / any bulk mutation | `form-auditor` fan-out / ONE `fleet-transformer` | MUST ([orchestration.md](references/orchestration.md)) |
| Any runtime error / failed smoke | `superpowers:systematic-debugging` | MUST before fixes |
| Before claiming done | `superpowers:verification-before-completion` | MUST — evidence first |

(Headless runs: ASK-strength conventions are skipped, MUST items still run.)

## Doc fallback

Unfamiliar API/component/action → `WebFetch` docs first (`shesha-grads.vercel.app/docs/` how-to; `docs.shesha.io` contracts); cache distillates. Token expired (24 h) → re-run Step 2.
