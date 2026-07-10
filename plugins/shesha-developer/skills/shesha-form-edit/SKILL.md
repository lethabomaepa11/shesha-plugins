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

> **For any new table / list / create / detail form, start from the canonical seeds in `assets/examples/` — see [references/examples.md](references/examples.md).** A "**table**"/grid request builds a `datatable`; a "**list**"/cards request builds a `datalist` — different components, pick from the user's wording ([data-tables.md](references/components/data-tables.md)). They are real Shesha-standard forms (verified rendering against a live backend) and encode the CRUD wiring most models get wrong: the **Add button opens the create form in a modal** (`Show Dialog`), detail views toggle edit in place (`Start Edit`/`Submit`), child tables use `tabs` + a `permanentFilter` on `{{data.id}}`, and inputs are chosen by the property's data type ([by-datatype.md](references/components/by-datatype.md)). Copy the matching example, swap entity/properties/captions/`formId`s, re-stamp `parentId`s, push. Don't hand-author structure the examples already provide.

> **Building a form to match a design?** If the requirements arrive as a **layout blueprint** (`<screen>.blueprint.md` from `shesha-developer:shesha-design-comprehension`, usually via the `shesha-claude-designer` orchestrator), treat that blueprint as the structure spec: its `Archetype` picks the seed, its `layout-tree` `flex=[…]`/nesting drive the **flex-container splits** (a `container` with `display:"flex"` + `flexDirection:"row"`, children sized via `desktop.dimensions.width` — **never the `columns` component**) + `parentId`s, and its `bindings` drive `propertyName`s. Build to it exactly — then expect a placement re-measure (the orchestrator's gate 5a.5) against the blueprint's `assertions`. See [references/blueprint-consumption.md](references/blueprint-consumption.md).

Args received: `$ARGUMENTS`. Flags: `--refresh-cache` (ignore TTL, re-distill metadata/seeds), `--no-browser` (skip Step 9 browser smoke), `--no-design` (skip Step 0 / 9.5 `frontend-design` consultation passes only — NOT Step 6.5), `--no-style` (skip the Step 6.5 default-theme styling pass — the only thing that skips it).

## Non-interactive (headless) runs — read this first

When invoked non-interactively (`claude -p`, a test harness, CI) or when the task supplies a context block (Backend URL / Username / Password / Module / Working directory): **never call `AskUserQuestion` — it dead-ends the run.** Use the supplied context verbatim — it **overrides** Step 1 URL discovery, Step 2 default credentials, and the target module. Defaults for every ask-gate: Step 0 design ask → skip, author from seeds; Step 6.5 default-theme pass → **always runs** (it never asks; it is how a no-design form gets the shipped `shesha` look); Step 3 missing form identity → resolve from the task wording against the module's form list (`GetAll`), else create a new form named `{entity-kebab}-{type}` in the context module; push-failure menu → re-fetch & re-apply once, then stop and report; Step 9.5 → skip. **Always end with a summary naming every form created or modified (module + name + id)** — downstream evaluation identifies your work from that output.

## Step R — Scale the effort to the request (always first)

Match your process weight to the task, and **default down** when unsure:

- **A small edit** (one component / property / script / action on an existing form) → stay inline, do Steps 1–8 only, skip the design pass, and only do a browser check (Step 9) if the change is visual/behavioral. Keep it cheap — don't run the full pipeline for a one-line tweak.
- **One whole form** (table / list / create / details / dialog / subform) → inline, full Steps 0–10 **including the Step 6.5 default-theme pass**, seed-first from `assets/examples/`. ("table"/grid → `datatable`; "list"/cards → `datalist`.)
- **Backend prerequisites may be missing** (entity / property / reflist / API / menu item) → gate on Step 4.5 (or the `fullstack-prereq-checker` agent) and fix gaps via the owning sibling skill BEFORE writing form JSON.
- **Multiple linked pages, or a whole app from a brief** → don't build it all in one context: plan first, then build in waves (create → details → table, then cross-link), orchestrating with `superpowers:dispatching-parallel-agents`, **and track every form in `<workspace>/form-manifest.json` (see [orchestration.md](references/orchestration.md)) — later forms are where styling/verification silently drops.** State the rough cost up front.

Also **route OUT non-form work** — a pure backend ask (reference list, role, notification, background job, API) goes straight to the sibling skill, not wrapped in form workflow.

**Styling authoring is not this skill's job — but TRIGGERING it is.** This skill builds correct **structure + CRUD wiring**; *appearance* (surfaces, backgrounds, shadows, layering, radii, v7 style blocks, theme) belongs to `shesha-developer:shesha-design-system`. A structural build/edit never reads styling docs and never authors v7 appearance blocks — but this skill is responsible for making sure the styling pass happens: via the mandatory Step 6.5 default-theme pass when no brand/design was supplied, or via the explicit handoff when the request is "make it look like X / match the design / style it / it looks bad / apply our brand" — build/confirm the structure, then `Skill(shesha-developer:shesha-design-system)`. The ONE layout concern that stays here is **structural splits**, which are flex `container` rows (`display:"flex"` + `flexDirection:"row"`, children sized via `desktop.dimensions.width`) — **never the `columns` component** (firm project rule).

## Step 0 — Design consultation (ask first)

For brand-new forms or major restructures, **ask the user via `AskUserQuestion`** whether to invoke the `frontend-design` skill for a design plan (typography, palette, spatial system, section list):

> Want a design consultation from the `frontend-design` skill for this form? It returns aesthetic direction (~30s extra) before authoring.
> - **Yes — get a design plan** (recommended for new pages / major restructures)
> - **No — author from seeds only** (good for adding fields, small tweaks, internal forms)

On Yes: invoke `Skill(skill="frontend-design", ...)` per [references/design.md](references/design.md); cache the plan at `.claude/cache/shesha-form-edit/design-plans/<form-name>.md` for Step 9.5.

**Don't ask** (skip silently) for: trivial edits (add a field, fix a script, change a propertyName), bug fixes, row-template / sub-form / utility forms, or when `--no-design` is in `$ARGUMENTS`. If `frontend-design` isn't installed, warn the user once and continue without it.

## Step 1 — Resolve backend URL

Order: **task-supplied context block (always wins)** → `src/*.Web.Host/Properties/launchSettings.json` (`profiles.Project.applicationUrl`) → `src/*.Web.Host/appsettings.json` (`Kestrel:Endpoints:Http:Url`) → fallback `http://localhost:21021`. Strip trailing slash. Store as `$BASE_URL`. Ping `$BASE_URL/swagger/index.html` to confirm reachability; if it fails, stop and tell the user to start the backend.

## Step 2 — Authenticate as admin

Task-supplied credentials win; local-dev defaults otherwise: **`admin` / `123qwe`** — don't ask. POST `$BASE_URL/api/TokenAuth/Authenticate` with `{ userNameOrEmailAddress, password }`; extract `result.accessToken` (or `accessToken` on older builds). See [references/api.md §2](references/api.md). If no token, surface raw response and stop.

**Authenticate once, then reuse — don't re-auth per call.** Cache the token to a session file (`$env:TEMP/shesha-form-edit/access-token`, or the `<workdir>/access-token` path supplied by the `shesha-claude-designer` orchestrator when invoked under it) and read it back on every subsequent call (`(Get-Content <tokenfile>)` / `$(cat <tokenfile>)`). **Never paste the raw JWT literally into a command** — it echoes back into context on every result. Re-authenticate only on a `401` or after the 24 h TTL. Under the orchestrator this means one auth for the whole multi-screen build, not one per screen.

**Module ID lookup** (needed for `Create`): `GET $BASE_URL/api/services/app/Module/GetAll` (note: `app` namespace — `Shesha/Module/GetAll` returns 404). Find the entry where `name === "<module>"` and take its `id`. Cache it for the session. If a subsequent `Create` call returns `"There is no entity Module with id = …"`, the backend was restarted and the ID changed — re-fetch via this endpoint.

## Step 3 — Identify the form

Required: form id **OR** (module + name). Ask the user only what's missing:

> Which form? Either give me the **id** (Guid), or **module + name** (e.g. `PBF.MembershipManagement` + `member-create`).

If module + name only, resolve via `GetByName` ([api.md §3](references/api.md)). Store as `$FORM_ID`.

**Version-aware resolution (0.43-class backends):** if the `GetByName`/`Get` response carries `versionNo` + `versionStatus`, this backend versions forms as ConfigurationItems — record both, and run the **in-flight-draft lookup** (`GetAll` + `IsLast==true`) before planning any edit: an existing Draft/Ready for the same Origin must be **reused**, never duplicated. Full flow: [references/version-lifecycle.md](references/version-lifecycle.md).

## Step 4 — Fetch the current markup

`GET /api/services/Shesha/FormConfiguration/GetJson?id=$FORM_ID` ([api.md §4](references/api.md)). Save to `$env:TEMP/shesha-form-edit/form-current.json` (all temp request/response files live under one session dir — never hardcode `/tmp`, which does not exist on Windows). The response body is a stringified form JSON; parse it. Resulting object has top-level `components` (nested tree) and `formSettings`.

## Step 4.5 — Entity introspection (mandatory for entity-bound forms)

Skip if `formSettings.dataLoaderType === "none"`. Otherwise fetch the entity's metadata and validate every `propertyName` in the edit.

**Get the exact entity type first (critical — wrong type causes 500 errors at runtime):**

`formSettings.modelType` must identify the **exact registered entity for THIS backend** — resolve it dynamically every time; never assume or copy a namespace from this doc. The same logical entity is registered under different namespaces across Shesha/BoxStack versions: framework entities like `Person` are `Shesha.Domain.Person` on current versions but `Shesha.Core.Person` on older ones, and a backend may even carry both. **The only authority is the live `EntityConfig` for the running backend** — its record gives you the `name`, `module`, and `fullClassName` you need below. Getting this wrong causes 500/404 errors in the browser when the loader or `dataContext` queries the entity — any mismatch with the registered entity is a runtime failure.

**Favour the object shape for `formSettings.modelType`:** `{ "name": "<ShortClass>", "module": "<Module>" }` (e.g. `{ "name": "Person", "module": "Shesha" }`) — the shape current Shesha builds emit. A full-class-name **string** still renders on legacy forms, but write new/edited forms with the object. **Independently, you always also need the resolved `fullClassName` string** — the metadata fetch below passes it as `?container=`, and component-level `entityType`s use either the short class+module or the full class string per their own rules (unchanged).

**Fast path — resolve everything in one call:** run `scripts/backend-probe.mjs` to collapse module id + entity resolve + metadata + reflist existence into a single run instead of the separate round-trips below — see [api.md Combined one-shot backend probe](references/api.md) / `scripts/backend-probe.mjs`.

Resolve it (in priority order) — and use the result verbatim:
1. **From entity config (authoritative)**: `GET $BASE_URL/api/services/app/EntityConfig/GetMainDataList?maxResultCount=200` — find the entity by `name`, then take its **`name` + `module`** for the `modelType` object **and** its **`fullClassName`** (fall back to `className`) for the metadata `container` param. These are authoritative — use them verbatim.
2. **Cross-check against an existing form**: `GET $BASE_URL/api/services/Shesha/FormConfiguration/GetAll?maxResultCount=50` — a form bound to the same entity shows the in-use `modelType`. If existing forms disagree with each other (legacy `Shesha.Core.*` vs current `Shesha.Domain.*`), the EntityConfig `fullClassName` wins.

**Entity existence check**: before building any form, verify the entity exists. Try the metadata routes **in order** until one returns a 200 property array: (1) `GET $BASE_URL/api/services/app/Metadata/GetProperties?container=<fullClassName>` → (2) `GET $BASE_URL/api/services/app/Metadata/Get?container=<fullClassName>` (`result.properties[]`) → (3) `GET $BASE_URL/api/services/Shesha/Metadata/Get?container=<fullClassName>`. **A 404 is NOT proof the entity is missing** — if all three 404 but `EntityConfig/GetMainDataList` returned this class, you have the wrong route/namespace or an unresolved `fullClassName`: re-resolve and retry; do NOT invoke `domain-model` to "create" an entity that already exists. Only an **empty property array from a 200** means the entity is truly unregistered → stop and invoke `Skill(skill="shesha-developer:domain-model")`.

**Metadata-availability gate (BLOCKING).** If none of the three routes return a 200 property array for a bound entity, you may NOT author or push ANY entity-bound or reference-list-bound component. Surface the exact failing URLs + HTTP codes and STOP. "Couldn't validate metadata" is never treated as "validated" — guessing `propertyName`s or reflist names from here is how empty dropdowns and dead bindings ship silently.

**If you (or `domain-model`) create or change an entity/property/reflist, the backend MUST be rebuilt and restarted before the entity is usable — follow [references/backend-restart.md](references/backend-restart.md).** Do this BEFORE building the form, and in this order: domain change → rebuild + restart (+ the 2-boot lag for new entities) → poll the entity's `…/api/dynamic/<module>/<Entity>/Crud/GetAll` until 200 → only then author/push the form. Never relaunch IIS Express outside Visual Studio (it 500s); headless runs take over :21021 with `dotnet`, attended runs hand the restart back to VS. This restart sequence is the biggest cost/failure sink when improvised — use the runbook.

1. Take the resolved `fullClassName` (the class-name string from the resolution above; `formSettings.modelType` itself is the `{ name, module }` object).
2. Fetch `GET $BASE_URL/api/services/app/Metadata/GetProperties?container=<fullClassName>` — `container` is the class-name **string**, never the object. Returns `result` as a direct array of properties (not wrapped). Cache to `.claude/cache/shesha-form-edit/metadata/<entity>.raw.json`.
3. **Validate `propertyName` against the property list** for every input component you're adding/editing. Surface mismatches before push.
4. **Validate reference-list identity (mandatory for every reflist-bound component).** For each `dropdown`/`radio`/`checkboxGroup`/`refListStatus` with `dataSourceType: "referenceList"`, the authored `referenceListId.{module,name}` (or `refListStatus`'s `module`/`referenceListName`) MUST be **copied verbatim** from that property's `referenceListName`/`referenceListModule` in the metadata above — **NEVER derived from the property or entity name** (deriving `status` → `FlightBookingStatus` when the real reflist is `BookingStatus` renders an empty dropdown with no error). Assert authored-vs-metadata equality; a mismatch is a fail, not a warning. This runs mechanically in Step 6's guardrail validator when you pass the cached metadata dump — do it there too, not just by eye.

Metadata semantics (`referenceListName` is the full dotted name used **without** any `RefList` prefix; `entityType` is the SHORT class name with `entityModule` separate; FK property names can differ from class names): [api.md §10](references/api.md). Array properties with `listConfiguration.mappingType: "many-to-many"` mean **junction subtables** — read [junction-subtables.md](references/components/junction-subtables.md) before touching those tabs.

TTL 24h; `--refresh-cache` forces re-fetch. If the metadata fetch returns nothing or surfaces a malformed entity, optionally invoke `Skill(skill="shesha-developer:test-entity-crud-api", args="--no-fix")` and fix entity bugs before continuing — a form bound to a broken entity will look fine in markup but fail at runtime.

**For a NEW entity-bound form, or any entity/junction not already verified this session: dispatch the `shesha-developer:fullstack-prereq-checker` agent** (Task tool; pass backend URL, token-file path, and the entity list) and block until its verdict is `ready` — its failures name the fixing skill per gap. Inline checks remain fine for small edits to an already-rendering form. Catalog of backend-rooted symptoms: [full-stack-prereqs.md](references/full-stack-prereqs.md).

## Step 5 — Apply the user's requirements

Read **only** the topic files relevant to the edit. Most edits need 1–3 files:

| Topic | File |
|---|---|
| Form structure, skeleton, IPropertySetting wrapper | [references/components/form-shape.md](references/components/form-shape.md) |
| Inputs, validation, file uploads | [references/components/inputs.md](references/components/inputs.md) |
| Dropdowns / radio / checkboxGroup / refListStatus | [references/components/dropdowns.md](references/components/dropdowns.md) |
| Autocomplete, entityPicker | [references/components/selectors.md](references/components/selectors.md) |
| Containers, card, **flex-row splits**, tabs (structure only — appearance → `shesha-design-system`) | [references/components/containers.md](references/components/containers.md) |
| Buttons, links, subForm, action wiring | [references/components/actions.md](references/components/actions.md) |
| Datatable (table/grid) vs datalist (card list), dataContext — incl. the **table-vs-list** decision | [references/components/data-tables.md](references/components/data-tables.md) |
| Component selection by property data type | [references/components/by-datatype.md](references/components/by-datatype.md) |
| Child tables on a detail view (tabs + permanentFilter) | [references/components/child-tables.md](references/components/child-tables.md) |
| **Block library — compose small vetted blocks (do this BEFORE copying a seed)** | [references/block-library.md](references/block-library.md) |
| Canonical example seeds (fallback when the block library lacks a shape) | [references/examples.md](references/examples.md) |
| Embedded scripts, current user, async/try-catch | [references/components/scripts.md](references/components/scripts.md) |
| Shared state (appContext, pageContext) | [references/components/shared-state.md](references/components/shared-state.md) |
| editMode, visibility, permissions | [references/components/edit-mode.md](references/components/edit-mode.md) |
| **Visual styling / appearance** (surfaces, shadows, layering, v7 style blocks, theme) | **do NOT read during a structural build — call `Skill(shesha-developer:shesha-design-system)`** |
| Layout pattern (full-page forms, auth) | [references/components/layout.md](references/components/layout.md) |
| Detail page **structure/nav** anatomy (sections, label grid, table→row nav) — *appearance of it (header band, KIB styling) → `shesha-design-system`* | [references/components/detail-page-pattern.md](references/components/detail-page-pattern.md) |
| M:M junction subtables — link, drill-down, delete/unlink | [references/components/junction-subtables.md](references/components/junction-subtables.md) |
| Add/create dialogs, formArguments, onPrepareSubmitData | [references/components/add-dialogs.md](references/components/add-dialogs.md) |
| Inline-editable datatables (editComponent shape, crud-operations column) | [references/components/inline-editable-tables.md](references/components/inline-editable-tables.md) |
| Form quality contract (always-on construction rules) | [references/form-quality.md](references/form-quality.md) |
| Form quality **detailed grading rubric** (rationale, edge-cases, worked example — for ambiguous checks / auditing) | [references/form-quality-rubric.md](references/form-quality-rubric.md) |
| Adding forms to the app navigation/menu | [references/navigation-menu.md](references/navigation-menu.md) |
| Edits across many forms (pilot-first transforms) | [references/bulk-operations.md](references/bulk-operations.md) |
| Multi-agent fleet dispatch, verdict schemas, cost table | [references/orchestration.md](references/orchestration.md) |
| Browser testing, IndexedDB cache, layout measurement | [references/verification.md](references/verification.md) |
| Symptoms whose fix is backend (reflists, junction DTOs, GQL) | [references/full-stack-prereqs.md](references/full-stack-prereqs.md) |
| Rebuild + restart the backend after a domain change (entity/migration) | [references/backend-restart.md](references/backend-restart.md) |

**Touching more than ~3 forms?** Read [references/bulk-operations.md](references/bulk-operations.md) first — pilot-first is mandatory. Mutations go through **one `shesha-developer:fleet-transformer` agent** (never per-form authoring agents); audits fan out **one `shesha-developer:form-auditor` per form**. Dispatch templates + cost table: [references/orchestration.md](references/orchestration.md).

**Authoring several new forms? Prefer building INLINE — dispatch agents only past a real threshold.** Each dispatched `form-author` agent independently re-loads this SKILL.md + its reference stack + seeds (tens of KB of context *per agent*), so for a small set the reload cost usually exceeds the parallelism benefit. Rule of thumb: **≤3 forms → build them inline in this context** (you already hold the skill + metadata); **4+ genuinely distinct forms → dispatch one `form-author` per form in parallel**, and give each a **distilled brief** (the chosen seed path, the metadata *summary*, the exact component shapes from the cheatsheet, and only the reference sections that apply) rather than telling it to re-read the whole skill — then you audit and push centrally. A single new form always stays in-context.

**Read [references/component-cheatsheet.md](references/component-cheatsheet.md) FIRST — for the common shapes it REPLACES seed-reading entirely.** It carries the current per-component `version` + minimal shape for `textField`/`dropdown`/`autocomplete`/`checkboxGroup`/`dataContext`/`buttonGroup`/**`datatable` + column items** — enough to author a table/create/detail form without opening any seed. So the default path is: **cheatsheet → block library → lean seed**, and only if none fits, a `Grep`/offset peek at a big seed.

**The big detail seeds are read-traps — treat them as quarantined.** `rs-detail-with-header.json` (756 KB), `employee-detail-with-child-tables.json` (700 KB), `employee-detail-without-child-tables.json` (395 KB), `employee-create.json` (208 KB), `rs-create-dialog.json` (196 KB), `rs-table.json` (134 KB), `employee-table.json` (122 KB) — a **full read of any of these blows the Read limit and costs tens of thousands of tokens.** NEVER read one wholesale; `Grep` for one specific fragment (one column's shape, one action config) with tight `-A/-B` only, and only when the cheatsheet + block library genuinely lack the shape. Prefer the small lean seeds — `standalone-create.json` (5 KB), `inline-editable-table.json`.

**Seed discovery for new forms** (in this order):
0. **`assets/blocks/` — the BLOCK LIBRARY (compose, don't copy-a-seed).** Build the form by composing small, individually-validated blocks (`flex-split-main-rail`, `page-header-band`, `meta-strip`, `card-with-header-strip`, `rail-panel`, `rail-label-value-row`, `status-pill`, `completeness-bar`, `requirement-datalist-row`, `dashed-add-button`) — assembly workflow in [references/block-library.md](references/block-library.md). Each block is a structure skeleton paired with a `shesha-design-system` style overlay and validated against the capability matrix (`scripts/validate-blocks.js`). This is cheaper (compose ~600 lines, not a 25K-line seed) and correct-by-construction — **prefer it.** Styling is applied by `shesha-design-system` from the paired overlay, not here.
1. **`assets/examples/` — CANONICAL Shesha-standard seeds (fallback when the block library lacks a shape).** See [references/examples.md](references/examples.md) for the index and the CRUD-loop wiring (modal Add button, Start Edit/Submit detail header, child-table tabs). Copy the matching example and change only `modelType`/`entityType`/`propertyName`/captions/`formId`s. **Prefer the small/lean seeds; never read the multi-thousand-line ones in full.** These forms render correctly and follow standards. On a 0.43-class backend (forms carry `versionStatus` — see [references/version-lifecycle.md](references/version-lifecycle.md)) use the **`assets/examples/043/` variants** — the same seeds transpiled to 0.43 shape (`datatableContext` wrapper, KB versions, flat style props) by `scripts/adapt-seed-to-043.js`; rerun it (`node scripts/adapt-seed-to-043.js --all`) after editing a 0.45 seed, never hand-edit `043/`.
2. `assets/patterns/` — other vendor seeds (index: [references/patterns.md](references/patterns.md)).
3. `.claude/cache/shesha-form-edit/seeds/` — project-specific forms cached from prior edits.
4. **MCP `search_forms`** — query `mcp__shesha__search_forms` for forms in this backend matching the layout type. Use the closest match as a seed; cache it under `seeds/` for next time.
5. Author from scratch only if no seed fits — guided by the design plan from Step 0.

**Picking the input component for each field** — driven by the property's `dataType` (string→textField, number→numberField, date→dateField, reference-list-item→dropdown, entity FK→autocomplete, …). Full table + config in [references/components/by-datatype.md](references/components/by-datatype.md).

**Proactive doc fetch**: when the user's requirements mention non-trivial mechanisms (wizard, OTP, navigator, complex appContext composition, custom action chaining), `WebFetch` the relevant `shesha-grads.vercel.app` / `docs.shesha.io` page **before** writing scripts. Distill into `.claude/cache/shesha-form-edit/docs/<topic>.summary.md` (~30 lines) so subsequent edits don't re-fetch.

**Component plan + index check (mandatory, blocking — do this before writing any component JSON)**:

**Consult the source-derived component KB first — `assets/components-kb/` ([references/component-kb.md](references/component-kb.md)).** It is generated from the Shesha renderer's own source (currently `releases/0.43`) and is authoritative for exact `type` strings, **current `version` per component** (counted from the real migrator chains), the designer's own `initModel` defaults, and settings props. **Where the KB and the hand-maintained cheatsheet/groups index disagree, the KB wins** for the backend generation it was built from; for other generations, regenerate it against that branch (command in component-kb.md). Critical 0.43 facts baked into the KB: the table/list data wrapper is **`datatableContext` (v7)** — `dataContext` (v2) is a *different* component (the app-context one); `datalist` is all-lowercase; `validationErrors` carries `version: 0` (it has a migrator — stamp the 0); and **style props are FLAT on 0.43** (`height`, `borderColor`, `backgroundColor`, `style`, `stylingBox` directly on the model — see `assets/components-kb/_shared-style-fields.json`) — the `desktop.`/`tablet.`/`mobile.` breakpoint style blocks are a 0.45+ structure and are **inert on 0.43**. Each component's KB file lists every configurable field (`settingsFields`: dimensions, borders, background, shadow, stylingBox, custom CSS class, style script, validation, events) — the full configurator surface; author only fields that exist there.

For every new or edited form, before writing a single component object:

1. **List every component `type` you plan to use.** (e.g. for a table form: `container`, `text`, `button`, `dataContext`, `datatable`; for a list form: `container`, `dataContext`, `datalist`, `datatable.pager`)

2. **Confirm each type exists** in the component index at `assets/groups/index.json` (bundled in this skill's assets folder). If a type is missing, you have the wrong name. The index is the authoritative source for the exact `type` string used in form JSON (e.g. `dataContext` for the table/list data wrapper; `datatable` not `dataTable`).

3. **Load the group file** for each component type (the index maps type → group file). Read the group file to get the full list of valid property names, their expected types, and descriptions. Only use properties listed there — anything else will be stripped by `clean-form-config` at Step 6.

4. **Scan the group for alternatives.** While in the group file, check whether a better-fit component exists (e.g. `refListStatus` instead of `dropdown` for read-only status display). **For side-by-side / split layout use a flex `container` row — NEVER the `columns` component** (firm project rule): `display:"flex"` + `flexDirection:"row"` + `gap`, with each child sized via `desktop.dimensions.width` (a fixed-width rail = `width:"332px"`; a filling main column = `width:"calc(100% - <rail+gap>px)"`). Per-child `customStyle:{flex:…}` does NOT size the outer div — proven inert; use `dimensions.width`.

5. **Update the plan** with corrected type names, valid properties, and any swapped alternatives — then write the JSON.

Tree-editing principles: preserve every existing component's `id` and `parentId` (fresh GUIDs only on clones / new nodes); when re-parenting, update only the moved node and add it to the new parent's `components`; don't touch `formSettings` unless asked.

**`parentId` is mandatory on every component** — the Shesha renderer uses it to build the component tree and crashes entirely when it is absent. Set `parentId` to the direct parent component's `id`. Components at the root level of a form get `parentId: "root"`. Components inside a `columns` slot get `parentId` equal to the `columns` component's `id` (not the slot's own `id`). Use a recursive stamping pass before push:

```js
function stampTree(nodes, parentId) {
  return nodes.map(node => {
    if (!node?.type) return { ...node, components: stampTree(node.components||[], parentId) }; // col slot
    const n = { ...node, parentId };
    if (n.components) n.components = stampTree(n.components, node.id);
    if (n.columns)    n.columns    = stampTree(n.columns,    node.id);
    if (n.tabs)       n.tabs       = n.tabs.map(t => ({ ...t, components: stampTree(t.components||[], node.id) }));
    if (n.content?.components) n.content = { ...n.content, components: stampTree(n.content.components, node.id) }; // card / collapsiblePanel slot
    if (n.header?.components)  n.header  = { ...n.header,  components: stampTree(n.header.components,  node.id) };
    return n;
  });
}
// Usage: markup.components = stampTree(markup.components, 'root');
```

## Step 5.5 — Pre-push JSON safety check (mandatory)

Before calling UpdateMarkup, run this Node snippet to catch JSON-in-JSON errors that will cause `"Expected ',' or ']' after array element in JSON"` in the browser:

```js
const markup = { /* your form object */ };
try {
  const str = JSON.stringify(markup);
  JSON.parse(str);        // must not throw
  JSON.parse(JSON.stringify({ markup: str })); // round-trip test
  console.log('JSON OK, length:', str.length);
} catch (e) {
  console.error('BROKEN JSON:', e.message);
  process.exit(1);
}
```

Common causes of failure: template literals (`` `${x}` ``) inside `dynamicEndpoint` or script fields — replace with string concatenation; literal newline characters in string values — replace with `\n`.

## Step 6 — Validate

Walk tree (unique ids, valid types, valid parent chain); dead-prop check: look up each component's group in `assets/groups/index.json`, then validate its props against that group file; runtime-type checks (booleans not `"true"`, numbers not `"42"`); dropdown `values` shape (`{ id, label, value }`); `node --check` each script string. Then run the **[form-quality checklist](references/form-quality.md)** (the compact always-on floor) — validationErrors present, human-readable labels, dropdown sources complete, primary action visible, consistent layout. For an ambiguous check, or when auditing/QA-grading a form, consult the detailed companion **[form-quality-rubric.md](references/form-quality-rubric.md)**.

**Migration-safety checks (mandatory — each of these silently passed review yet crashed the live form):**
- **Every component has an integer `version`.** A versionless component re-runs the whole legacy migration chain at render and can throw `e.match` / `reading 'migrator'` / `reading 'version'`. Flag any component object missing `version` (except pure layout slots).
- **No `defaultValue` that is a non-string** (array/number/object). `defaultValue` is resolved as a mustache template via `.match()`; a literal array → `e.match is not a function`. Flag and remove (or convert to a data binding).
- **Datatable `editComponent`/`createComponent` is `[not-editable]` or `{type, settings:{…}}`** — never `[default]` (→ `reading 'migrator'`), never a flat model missing the `settings` wrapper (→ `reading 'version'`). Flag either.
- **`checkboxGroup` hardcoded options live in `items` (not `values`)** with `version: 5`.

Then **invoke `clean-form-config` ONCE, right before the final push** (mandatory, blocking) — covers layout overflow, label-vs-propertyName refs, missing try/catch, missing async, broken script syntax:

```
Skill(skill="shesha-developer:clean-form-config", args="<path to your edited form>")
```

**Run it once on the finished markup — not after every intermediate edit** (re-running it per change is a large, repeated cost for no extra signal). **Known false positives — don't re-investigate or strip these:** the `dataContext` data props (`entityType`, `sourceType`, `dataFetchingMode`, `defaultPageSize`, …), container `direction`/`flexDirection`, `text.padding`, and the datatable inline props (`canEditInline`/`canAddInline`/`canDeleteInline`/`inlineEditMode`/`inlineSaveMode`) are valid and render in live forms; the bundled index just doesn't enumerate them.

**Then run the mechanical guardrail validator (mandatory, blocking):** `node <skill-root>/scripts/validate-guardrails.js <path to your edited form> <cached metadata .raw.json for the entity>` — it catches the recurring render-killers (buttonGroup with no primary, standalone action buttons, Navigate with an empty target, PascalCase datatable columns, dataContext missing `entityType`/`sourceType`, missing `validationErrors`, FK columns bound to the raw `…Id` scalar) **and cross-checks every reference-list binding against the entity metadata** (empty dropdown from a guessed reflist name). **Always pass the cached metadata dump as the second argument** — without it the reflist check downgrades to an un-enforced `warn`. Zero `fail` findings before push; fix `warn` findings unless there's a stated reason not to.

**Reference-list existence + items gate (BLOCKING for every reflist-bound component).** Before push, confirm each referenced reflist actually **exists and has ≥1 item**: `GET $BASE_URL/api/services/app/ReferenceList/GetByName?name=<referenceListName>&module=<referenceListModule>` (values from the property metadata). A missing list (404) or zero items is a blocking fail — surface it and hand off to `Skill(skill="shesha-developer:domain-model")` to add the `[ReferenceList]` attribute / items. A dropdown bound to a non-existent or empty reflist renders blank at runtime and is invisible to structural checks — this is the only pre-browser way to catch it.

If validation surfaces a REAL issue, fix it before pushing. **Never push a config that fails validation without user confirmation.**

**Before any bulk push (>3 forms changed): fan out `shesha-developer:form-auditor` agents — one per form** — with the verdict contract from [orchestration.md](references/orchestration.md); aggregate and never push a form with a `fail` verdict.

## Step 6.5 — Default-theme styling pass (mandatory)

**No form ships unstyled.** For any **new form or major restructure** where **no brand/design source was supplied** (the user named no brand, and the run did not arrive from `shesha-claude-designer` with a blueprint + brand), invoke the design system on the validated markup **before** the Step 7 push:

```
Skill(skill="shesha-developer:shesha-design-system", args="apply the default shesha theme quick pass per references/default-theme-quickpass.md to <path to your edited form>")
```

Merge the returned styled JSON into your working markup so there is still exactly **one** push in Step 7.

- **Never asks a question** — this step calls no `AskUserQuestion` and therefore also runs headless. Only the `--no-style` flag skips it (`--no-design` does NOT).
- **Exempt:** small edits to an existing form (Step R bullet 1), and runs arriving from the `shesha-claude-designer` pipeline (the orchestrator's own styling step owns appearance there).
- **When the user DID name a brand or design**, this step is superseded by the explicit `shesha-design-system` handoff with that brand (see Step R) — same mechanism, different token file.
- Re-run the Step 5.5 JSON safety check on the merged result before pushing.

## Step 7 — Push

**Version-gated (check BEFORE any write):** if Step 3 found `versionStatus` on this backend (0.43-class), the push follows the **[version lifecycle](references/version-lifecycle.md)** — never a bare in-place UpdateMarkup:
- **Live(3)** → `CreateNewVersion` **once** → `UpdateMarkup` on the **new Draft id** → publish `UpdateStatus` 1→2→3 (auto-retires the old Live) → clear the frontend IndexedDB cache.
- **Draft(1)/Ready(2) in flight** → reuse it: `UpdateMarkup` on **its** id, publish when gates pass. Never `CreateNewVersion` beside it.
- **Retired(5)/Cancelled(4)** → never write; resolve to the latest non-terminal version first.
- **Brand-new form** → `Create` → `UpdateMarkup` the Draft → publish 1→2→3 → clear cache.
- **One Draft per edit session** — every verify/fix re-push targets the same Draft id; the session ends with it Live or explicitly `CancelVersion`-ed, never dangling.

On non-versioned backends (no `versionStatus` in responses, e.g. 0.45 mutable forms), push directly: **UpdateMarkup** — `PUT $BASE_URL/api/services/Shesha/FormConfiguration/UpdateMarkup`, body `{ "id": "$FORM_ID", "markup": "<stringified form JSON>" }`. Build the body in Node to avoid escaping pain. See [api.md §5](references/api.md).

**Scratch-file hygiene (avoids a recurring time-sink AND stops project clutter):** write **all** scratch — build/push scripts, staged markup JSON, probe dumps — into the session **`$WORKDIR`** (the `<workdir>` the orchestrator supplies, or `$env:TEMP/shesha-form-edit/` standalone). **NEVER write scratch into the user's project directory / cwd, and NEVER into an unrelated folder** — a run that litters `build_*.js` / `*.markup.json` across the project tree (or a sibling repo) erodes trust. Also do NOT use `/tmp` — git-bash `/tmp` maps to `%TEMP%` (e.g. `C:\Users\…\AppData\Local\Temp`), a *different* path than Windows `C:\tmp` and from PowerShell `$env:TEMP`, so a file written by `bash` is frequently "not found" by `node`/PowerShell. Pass values into Node via **env vars** (`VAR=x node script.js`), not positional argv that the shell may not forward. Prefer **one combined fetch→mutate→push script** over many small probe commands (each round-trip is cost).

Alternative: **ImportJson** — multipart upload (`ItemId` + `file`). See [api.md §6](references/api.md). Both write `Markup` on the form configuration.

Success: HTTP 200 with `{ "result": ... }`.

### On push failure (any non-200)

1. Surface the raw response and a short diagnosis.
2. Ask the user via `AskUserQuestion`: **retry as-is** / **re-fetch and re-apply** / **abort**.
3. Act on the choice. **Never silently retry. Never just stop.**

On a versioned backend, recovery must be **lifecycle-aware** ([version-lifecycle.md §Failure recovery](references/version-lifecycle.md)): a failed publish after a good `UpdateMarkup` leaves a real Draft — retry `UpdateStatus` on the **same** Draft id or `CancelVersion` it; never spawn a second Draft, never abandon one silently.

## Step 8 — Verify

Re-fetch via `GetByName`/`GetJson`; diff against what you sent. Surface any normalization the server applied. **On a versioned backend, verify the lifecycle landed** ([version-lifecycle.md §Version-aware verification](references/version-lifecycle.md)): latest `GetByName` returns `versionStatus === 3` with `versionNo` = previous + 1, the old Live is now Retired(5), and you diff against the **new** version's id — re-fetching the pre-edit id returns the retired copy and misleads you. After create+publish, clear the frontend IndexedDB stores (`forms`, `entities`, `ref-lists`, `misc`) from a static page. For anonymous forms (`access: 5`), confirm `result.access === 5` — the `Create` endpoint may not honor `access` on initial create; call `UpdateMarkup` once more if it didn't stick.

## Step 8.5 — Diagnose common runtime errors

After verifying, watch for these patterns in the browser console or from Playwright:

| Error | Cause | Fix |
|---|---|---|
| `HTTP 400` on dataContext data load | Entity doesn't have GQL query API enabled in backend | Invoke `shesha-developer:domain-model` to enable GQL on entity, or use `sourceType: "Url"` with an explicit REST endpoint |
| `HTTP 404` on metadata fetch (`"Failed to fetch metadata of type …"`) | Wrong entity class name in `formSettings.modelType` | Re-verify entity type via `EntityConfig/GetMainDataList` or `FormConfiguration/GetAll` on existing forms |
| `HTTP 500` on dataContext | `entityType` or `sourceType` missing on the `dataContext` component | Add `entityType`, `sourceType: "Entity"`, `dataFetchingMode`, `defaultPageSize`, `uniqueStateId` |
| `JSON parse error` in browser console | Malformed script string in form markup — template literals or literal newlines | Run Step 5.5 JSON safety check; replace template literals with concatenation |
| Form shows blank/empty without error | Short IDs (`pr1`, `btn2`) or all-`root` parentIds | Re-run `stampTree`; ensure `crypto.randomUUID()` IDs |
| Detail form shows blank when navigated to without `?id=` | Normal — `gql` loader has no ID to fetch | This is expected; test detail forms with `?id=<real-guid>` |
| Create/edit fields show as read-only labels (no input boxes) standalone | `editMode: "inherited"` + form not in edit context | Expected — they become inputs inside the Add modal (`formMode: "edit"`) or after Start Edit. Don't "fix" by forcing `editable`. |
| Dropdown opens but shows "No matches" / no options | The backend **reference list has no items**, or wrong `referenceListId` | Verify the reflist name via property metadata; confirm items exist in the backend reflist editor. Config itself (see by-datatype.md) is likely correct. |
| Autocomplete (FK) shows "No matches" | Target entity has no records, or wrong `entityType:{name,module}` | Confirm the FK target short class name + module; ensure records exist. |
| Junction/child `Crud/Create` 500 on dialog submit | Contextually-preset FK never reached the payload (`_formFields` rule) | Real component + `formSettings.onPrepareSubmitData` — see [add-dialogs.md](references/components/add-dialogs.md) |
| Push returned 200 but the browser shows old markup | Frontend IndexedDB form cache | Clear from a static page (`/favicon.ico`) — see [verification.md](references/verification.md) |

Full catalog (~40 rows, grouped): [references/debug.md](references/debug.md).

## Step 9 — Browser smoke (default; `--no-browser` opts out)

Invoke the playwright skill to load the form, screenshot, and capture console + network errors that JSON validation can't catch (editMode regressions, runtime script failures, broken layout). Recipe in [api.md §12](references/api.md):

```
Skill(skill="playwright", args="<directive from api.md §12, with FRONTEND_URL + form path filled in>")
```

**Frontend: focus on the `adminportal`** — the app UI this skill renders and verifies against (typical dev port `http://localhost:3000`; read the actual port from `adminportal/.env*` or `adminportal/package.json` `scripts.dev`). Use `publicportal` ONLY for a genuinely anonymous/public form (`access: 5`). If the adminportal isn't running, do NOT silently pass — report the form **could not be visually verified (adminportal not running)** and offer `--no-browser`.

Test `*-details` forms via the **table row's view link**, never a pasted `?id=` URL — direct loads render but subtable Add/Create submits 500 (missing page context). If the browser disagrees with a verified API re-fetch, clear the **IndexedDB form cache from `/favicon.ico`** before debugging further.

**Verification cost discipline (this is where runs blow up — keep it tight):**
- Assert with the **a11y snapshot** + `getBoundingClientRect`/`getComputedStyle`, **not screenshots**. Reading a full-page screenshot is ~60 KB of tokens each — take **at most ONE screenshot, at the very end** for a final visual confirmation, never one per iteration.
- **Batch all DOM measurements into a single `evaluate` call** rather than climbing the tree across many calls.
- Before reaching for the browser, check whether the layout question is already answered by a recipe — e.g. full-width = `display:"flex"` + `flexDirection:"column"` + `alignItems:"stretch"`; a flex container needs an explicit `display:"flex"` or `flexDirection` is inert; date renders `&#x2F;` = use `{{{triple-brace}}}`. (v7 styling mechanics now live in `shesha-design-system/references/styling-v7-mechanics.md`.) Don't rediscover documented gotchas with a long browser loop.

Full recipes: [references/verification.md](references/verification.md).

**On any captured error or 4xx/5xx**: consult [references/debug.md](references/debug.md) before guessing — it maps common symptoms to causes. Quote the captured error verbatim; reference the matching row number.

## Step 9.5 — Aesthetic review (ask first; skip if `--no-design` or no Step 0 plan)

If a design plan exists for this form, **ask the user via `AskUserQuestion`** whether to run a post-render aesthetic critique:

> Run an aesthetic review on the rendered form via `frontend-design`? It compares the screenshot against the design plan and returns up to 5 prop-level tweaks.
> - **Yes — review and suggest tweaks**
> - **No — confirm and finish**

On Yes: pass screenshot + plan + original requirements to `frontend-design`. Surface findings as **suggestions, not blockers** — accept/reject per item; on accept, loop back to Step 5 → 8 → 9. Recipe: [references/design.md](references/design.md).

## Step 10 — Confirm

Tell the user: form `$FORM_ID` updated. Authenticated forms render at `/dynamic/<module>/<form>`; anonymous at `/no-auth/<module>/<form>`.

## Cache (`.claude/cache/shesha-form-edit/`)

Project-scoped learning state. **Skill reads `.summary.md` by default; opens raw `.raw.json` only when summary is insufficient.** Layout: `metadata/`, `seeds/`, `docs/`, `_archive/` — see `.claude/cache/shesha-form-edit/README.md`. Populate via `node .claude/skills/shesha-form-edit/scripts/summarize.js <input.json> [--out <out.summary.md>]`. TTLs: metadata 24h; seeds invalidate on `versionNo` change. `--refresh-cache` ignores TTL.

## Non-negotiables — always-on floor

These apply to EVERY form. The one-liners below are the floor; the **full list with the failure mode each rule prevents is [references/non-negotiables.md](references/non-negotiables.md) — read it before authoring or editing** (and note the mechanical validator in Step 6 enforces the render-killers regardless).

- **`parentId` on every component** (root-level → `"root"`; use `stampTree`), and **`id` is a real UUID** — missing either renders the form blank.
- **Every component carries its current integer `version`** — resolve from the KB / cheatsheet for the target generation; a stale/absent version crashes migration or silently drops the style block.
- **Action buttons live in ONE `buttonGroup`, never standalone `button`s** — and Save = `actionConfiguration:{ actionName:"Submit", actionOwner:"shesha.form" }`.
- **A `validationErrors` component is present whenever any input is required.**
- **Every `propertyName` is camelCase** (GQL keys are camelCase; PascalCase renders blank cells/dead bindings).
- **Reference-list identity is READ from metadata, never guessed** — `referenceListId.{module,name}` comes verbatim from the property's `referenceListName`/`referenceListModule`; verify it exists + has items (Step 6). A guessed name renders an empty dropdown silently.
- **`modelType` is the resolved `{ name, module }`, never assumed** — resolve from `EntityConfig/GetMainDataList` for the running backend.
- **Splits are flex `container` rows** (`display:"flex"` + `flexDirection:"row"`, children sized via `desktop.dimensions.width`) — **never the `columns` component** (firm project rule).
- **Mustache uses `{{double braces}}`; scripts are JSON-safe** (no template literals / unescaped newlines) and use `try/catch` + `async/await` (no `.then()`).
- **`editMode` is per form type** — detail-with-lifecycle → `"inherited"`; create/edit/action pages → `"editable"`; never blanket-stamp.
- **No form ships unstyled** — the Step 6.5 default-theme pass runs unless `--no-style`.
- **One push path, fully gated** — `clean-form-config` + `validate-guardrails.js` (with the metadata arg) before every push; versioned (0.43) backends push via CreateNewVersion→Draft→publish; all scratch under `$WORKDIR`, token cached BOM-free.
- **API namespace is per-service** — `FormConfiguration` under `/services/Shesha/`; `Metadata`/`Module`/`EntityConfig`/`ReferenceList` under `/services/app/`. A 404 is usually the wrong namespace, not a missing resource.

## Required skill & agent invocations

| Trigger | Invoke | Strength |
|---|---|---|
| Entity/property/reflist missing or broken (Step 4.5 gate) | `shesha-developer:domain-model` | MUST before any form push |
| After a domain change (entity/property/reflist/migration created) | [backend-restart.md](references/backend-restart.md) runbook (rebuild + restart + 2-boot + poll CRUD) | MUST before building the form |
| New entity-bound form / unverified entity this session | `shesha-developer:fullstack-prereq-checker` agent | MUST (block until `ready`) |
| Form needs a custom (non-dynamic) endpoint for a Url-source or submit | `shesha-developer:shesha-app-layer` | MUST before wiring the endpoint |
| Every push (Step 6) | `shesha-developer:clean-form-config` | MUST (respect its documented false positives) |
| Every push (Step 6) | `scripts/validate-guardrails.js` | MUST (zero `fail` findings) |
| New form / major restructure, no brand or design named (Step 6.5) | `shesha-developer:shesha-design-system` default-theme quick pass | MUST before push (only `--no-style` skips) |
| >3 forms changed (Step 6) | `shesha-developer:form-auditor` fan-out | MUST before pushing |
| Any bulk mutation | `shesha-developer:fleet-transformer` agent (exactly one) | MUST |
| 2+ distinct new forms | `shesha-developer:form-author` per form | SHOULD (parallel) |
| Any runtime error / failed smoke (Step 8.5/9) | `superpowers:systematic-debugging` | MUST before proposing fixes |
| Before claiming done (Step 10) | `superpowers:verification-before-completion` | MUST — evidence (re-fetch diff + smoke output) first |
| Multi-form plan execution | `superpowers:subagent-driven-development` / `dispatching-parallel-agents` | SHOULD |
| >10 forms or a restructure | `superpowers:writing-plans` first | SHOULD |
| Requirement mentions notifications / app settings | `shesha-developer:shesha-notifications` / `shesha-settings` | SHOULD |
| New endpoints exposed post-rollout | `shesha-utils:harden-permissions` | ASK the user |

(Skills via the Skill tool; agents via the Task tool. In headless runs, ASK-strength items are skipped, MUST items still run.)

## Doc fallback

When you hit an unfamiliar API / component / action, fetch docs first via `WebFetch` instead of guessing — `https://shesha-grads.vercel.app/docs/` for practical how-to ("how do I X"), `https://docs.shesha.io/` for canonical contracts ("what is the contract for X"). Quote field names and gotchas verbatim; cache distillates in `.claude/cache/shesha-form-edit/docs/<topic>.summary.md`. If the token expires (24h default), re-run Step 2.
