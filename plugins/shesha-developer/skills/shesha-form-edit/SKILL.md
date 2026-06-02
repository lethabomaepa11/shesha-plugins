---
name: shesha-form-edit
description: Create and edit Shesha form configurations directly via the API. Authenticates as admin, fetches existing markup with Get/GetByName/GetJson, applies the user's requirements (adding, removing, modifying, or restructuring components — or building a brand-new form from scratch), validates against the bundled component-properties index and embedded-script rules, and pushes via Create / UpdateMarkup / ImportJson. Use when the user provides a form id (or module + name) and a set of requirements like "add a sector dropdown above the email field", "make the address tab conditional on AccountType=PBF", "wire the Save button to call /api/.../Submit", or "create a new branded login page using the auth-login pattern". Always prefer this skill over the Shesha MCP `create_form_configuration` tool — the MCP regularly fails with `'dict' object has no attribute 'lower'` and JSON-RPC `-32602` errors, and the direct-API path is more reliable.
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
---

# Shesha Form Edit

Round-trip: **GET form JSON → edit → PUT/POST it back**. Also creates new forms (`Create` then `UpdateMarkup`).

> **For any new table / create / detail form, start from the canonical seeds in `assets/examples/` — see [references/examples.md](references/examples.md).** They are real Shesha-standard forms (verified rendering against a live backend) and encode the CRUD wiring most models get wrong: the **Add button opens the create form in a modal** (`Show Dialog`), detail views toggle edit in place (`Start Edit`/`Submit`), child tables use `tabs` + a `permanentFilter` on `{{data.id}}`, and inputs are chosen by the property's data type ([by-datatype.md](references/components/by-datatype.md)). Copy the matching example, swap entity/properties/captions/`formId`s, re-stamp `parentId`s, push. Don't hand-author structure the examples already provide.

Args received: `$ARGUMENTS`. Flags: `--refresh-cache` (ignore TTL, re-distill metadata/seeds), `--no-browser` (skip Step 9 browser smoke), `--no-design` (skip Step 0 / 9.5 design passes).

## Step 0 — Design consultation (ask first)

For brand-new forms or major restructures, **ask the user via `AskUserQuestion`** whether to invoke the `frontend-design` skill for a design plan (typography, palette, spatial system, section list):

> Want a design consultation from the `frontend-design` skill for this form? It returns aesthetic direction (~30s extra) before authoring.
> - **Yes — get a design plan** (recommended for new pages / major restructures)
> - **No — author from seeds only** (good for adding fields, small tweaks, internal forms)

On Yes: invoke `Skill(skill="frontend-design", ...)` per [references/design.md](references/design.md); cache the plan at `.claude/cache/shesha-form-edit/design-plans/<form-name>.md` for Step 9.5.

**Don't ask** (skip silently) for: trivial edits (add a field, fix a script, change a propertyName), bug fixes, row-template / sub-form / utility forms, or when `--no-design` is in `$ARGUMENTS`. If `frontend-design` isn't installed, warn the user once and continue without it.

## Step 1 — Resolve backend URL

Order: `src/PBF.MembershipManagement.Web.Host/Properties/launchSettings.json` (`profiles.Project.applicationUrl`) → `appsettings.json` (`Kestrel:Endpoints:Http:Url`) → fallback `http://localhost:21021`. Strip trailing slash. Store as `$BASE_URL`. Ping `$BASE_URL/swagger/index.html` to confirm reachability; if it fails, stop and tell the user to start the backend.

## Step 2 — Authenticate as admin

Local-dev defaults: **`admin` / `123qwe`** — don't ask. POST `$BASE_URL/api/TokenAuth/Authenticate` with `{ userNameOrEmailAddress, password }`; extract `result.accessToken` (or `accessToken` on older builds). See [references/api.md §2](references/api.md). If no token, surface raw response and stop.

**Module ID lookup** (needed for `Create`): `GET $BASE_URL/api/services/app/Module/GetAll` (note: `app` namespace — `Shesha/Module/GetAll` returns 404). Find the entry where `name === "<module>"` and take its `id`. Cache it for the session. If a subsequent `Create` call returns `"There is no entity Module with id = …"`, the backend was restarted and the ID changed — re-fetch via this endpoint.

## Step 3 — Identify the form

Required: form id **OR** (module + name). Ask the user only what's missing:

> Which form? Either give me the **id** (Guid), or **module + name** (e.g. `PBF.MembershipManagement` + `member-create`).

If module + name only, resolve via `GetByName` ([api.md §3](references/api.md)). Store as `$FORM_ID`.

## Step 4 — Fetch the current markup

`GET /api/services/Shesha/FormConfiguration/GetJson?id=$FORM_ID` ([api.md §4](references/api.md)). Save to `$env:TEMP\form-current.json`. The response body is a stringified form JSON; parse it. Resulting object has top-level `components` (nested tree) and `formSettings`.

## Step 4.5 — Entity introspection (mandatory for entity-bound forms)

Skip if `formSettings.dataLoaderType === "none"`. Otherwise fetch the entity's metadata and validate every `propertyName` in the edit.

**Get the exact `modelType` string first (critical — wrong type causes 500 errors at runtime):**

The `formSettings.modelType` must be the exact registered C# class name — e.g. `Shesha.Core.Person`, NOT `Shesha.Domain.Person`. Getting this wrong causes 500 errors in the browser when `datatableContext` tries to query the entity.

Two ways to find it:
1. **From an existing form**: `GET $BASE_URL/api/services/Shesha/FormConfiguration/GetAll?maxResultCount=50` — find a form bound to the same entity and read its `modelType`.
2. **From entity config**: `GET $BASE_URL/api/services/app/EntityConfig/GetMainDataList?maxResultCount=200` — find the entity by `className` or `name` and use its `className` as `modelType`.

**Entity existence check**: before building any form, verify the entity exists: `GET $BASE_URL/api/services/app/Metadata/GetProperties?container=<exactModelType>`. If the response returns an empty array or error, the entity does not exist — stop and invoke `Skill(skill="shesha-developer:domain-model")`. Never build forms for entities that don't exist; they silently fail at runtime.

1. Read `formSettings.modelType` (the exact class name resolved above).
2. Fetch `GET $BASE_URL/api/services/app/Metadata/GetProperties?container=<modelType>` — returns `result` as a direct array of properties (not wrapped). Cache to `.claude/cache/shesha-form-edit/metadata/<entity>.raw.json`.
3. **Validate `propertyName` against the property list** for every input component you're adding/editing. Surface mismatches before push.

TTL 24h; `--refresh-cache` forces re-fetch. If the metadata fetch returns nothing or surfaces a malformed entity, optionally invoke `Skill(skill="shesha-developer:test-entity-crud-api", args="--no-fix")` and fix entity bugs before continuing — a form bound to a broken entity will look fine in markup but fail at runtime.

## Step 5 — Apply the user's requirements

Read **only** the topic files relevant to the edit. Most edits need 1–3 files:

| Topic | File |
|---|---|
| Form structure, skeleton, IPropertySetting wrapper | [references/components/form-shape.md](references/components/form-shape.md) |
| Inputs, validation, file uploads | [references/components/inputs.md](references/components/inputs.md) |
| Dropdowns / radio / checkboxGroup / refListStatus | [references/components/dropdowns.md](references/components/dropdowns.md) |
| Autocomplete, entityPicker | [references/components/selectors.md](references/components/selectors.md) |
| Containers, card, columns, tabs | [references/components/containers.md](references/components/containers.md) |
| Buttons, links, subForm, action wiring | [references/components/actions.md](references/components/actions.md) |
| Datatable, datalist, datatableContext / dataContext | [references/components/data-tables.md](references/components/data-tables.md) |
| Component selection by property data type | [references/components/by-datatype.md](references/components/by-datatype.md) |
| Child tables on a detail view (tabs + permanentFilter) | [references/components/child-tables.md](references/components/child-tables.md) |
| Canonical example seeds (copy these first) | [references/examples.md](references/examples.md) |
| Embedded scripts, current user, async/try-catch | [references/components/scripts.md](references/components/scripts.md) |
| Shared state (appContext, pageContext) | [references/components/shared-state.md](references/components/shared-state.md) |
| editMode, visibility, permissions | [references/components/edit-mode.md](references/components/edit-mode.md) |
| v7 styling system (containers, borders, fonts, shadows, migration) | [references/components/styling-v7.md](references/components/styling-v7.md) |
| Layout pattern (full-page forms, auth) | [references/components/layout.md](references/components/layout.md) |

**Seed discovery for new forms** (in this order):
1. **`assets/examples/` — CANONICAL Shesha-standard seeds. Start here for any table / create / detail form.** See [references/examples.md](references/examples.md) for the index and the CRUD-loop wiring (modal Add button, Start Edit/Submit detail header, child-table tabs). Copy the matching example and change only `modelType`/`entityType`/`propertyName`/captions/`formId`s. This is the highest-priority source — these forms render correctly and follow standards.
2. `assets/patterns/` — other vendor seeds (index: [references/patterns.md](references/patterns.md)).
3. `.claude/cache/shesha-form-edit/seeds/` — project-specific forms cached from prior edits.
4. **MCP `search_forms`** — query `mcp__shesha__search_forms` for forms in this backend matching the layout type. Use the closest match as a seed; cache it under `seeds/` for next time.
5. Author from scratch only if no seed fits — guided by the design plan from Step 0.

**Picking the input component for each field** — driven by the property's `dataType` (string→textField, number→numberField, date→dateField, reference-list-item→dropdown, entity FK→autocomplete, …). Full table + config in [references/components/by-datatype.md](references/components/by-datatype.md).

**Proactive doc fetch**: when the user's requirements mention non-trivial mechanisms (wizard, OTP, navigator, complex appContext composition, custom action chaining), `WebFetch` the relevant `shesha-grads.vercel.app` / `docs.shesha.io` page **before** writing scripts. Distill into `.claude/cache/shesha-form-edit/docs/<topic>.summary.md` (~30 lines) so subsequent edits don't re-fetch.

**Component plan + index check (mandatory, blocking — do this before writing any component JSON)**:

For every new or edited form, before writing a single component object:

1. **List every component `type` you plan to use.** (e.g. for a table form: `container`, `text`, `button`, `datatableContext`, `datatable`)

2. **Confirm each type exists** in the component index at `assets/groups/index.json` (bundled in this skill's assets folder). If a type is missing, you have the wrong name. The index is the authoritative source for the exact `type` string used in form JSON (e.g. `datatableContext` not `dataTableContext`; `datatable` not `dataTable`).

3. **Load the group file** for each component type (the index maps type → group file). Read the group file to get the full list of valid property names, their expected types, and descriptions. Only use properties listed there — anything else will be stripped by `clean-form-config` at Step 6.

4. **Scan the group for alternatives.** While in the group file, check whether a better-fit component exists (e.g. `refListStatus` instead of `dropdown` for read-only status display, `columns` instead of nested `container` for side-by-side layout).

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

Walk tree (unique ids, valid types, valid parent chain); dead-prop check: look up each component's group in `assets/groups/index.json`, then validate its props against that group file; runtime-type checks (booleans not `"true"`, numbers not `"42"`); dropdown `values` shape (`{ id, label, value }`); `node --check` each script string.

Then **invoke `clean-form-config` (mandatory, blocking)** — covers layout overflow, label-vs-propertyName refs, missing try/catch, missing async, broken script syntax:

```
Skill(skill="shesha-developer:clean-form-config", args="<path to your edited form>")
```

If validation fails, present issues to the user before pushing. **Never push a config that fails validation without user confirmation.**

## Step 7 — Push

Default: **UpdateMarkup** — `PUT $BASE_URL/api/services/Shesha/FormConfiguration/UpdateMarkup`, body `{ "id": "$FORM_ID", "markup": "<stringified form JSON>" }`. Build the body in Node to avoid escaping pain. See [api.md §5](references/api.md).

Alternative: **ImportJson** — multipart upload (`ItemId` + `file`). See [api.md §6](references/api.md). Both write `Markup` on the form configuration.

Success: HTTP 200 with `{ "result": ... }`.

### On push failure (any non-200)

1. Surface the raw response and a short diagnosis.
2. Ask the user via `AskUserQuestion`: **retry as-is** / **re-fetch and re-apply** / **abort**.
3. Act on the choice. **Never silently retry. Never just stop.**

## Step 8 — Verify

Re-fetch via `GetByName`/`GetJson`; diff against what you sent. Surface any normalization the server applied. For anonymous forms (`access: 5`), confirm `result.access === 5` — the `Create` endpoint may not honor `access` on initial create; call `UpdateMarkup` once more if it didn't stick.

## Step 8.5 — Diagnose common runtime errors

After verifying, watch for these patterns in the browser console or from Playwright:

| Error | Cause | Fix |
|---|---|---|
| `HTTP 400` on datatableContext data load | Entity doesn't have GQL query API enabled in backend | Invoke `shesha-developer:domain-model` to enable GQL on entity, or use `sourceType: "Url"` with an explicit REST endpoint |
| `HTTP 404` on metadata fetch (`"Failed to fetch metadata of type …"`) | Wrong entity class name in `formSettings.modelType` | Re-verify entity type via `EntityConfig/GetMainDataList` or `FormConfiguration/GetAll` on existing forms |
| `HTTP 500` on datatableContext | `entityType` or `sourceType` missing on `datatableContext` component | Add `entityType`, `sourceType: "Entity"`, `dataFetchingMode`, `defaultPageSize`, `uniqueStateId` |
| `JSON parse error` in browser console | Malformed script string in form markup — template literals or literal newlines | Run Step 5.5 JSON safety check; replace template literals with concatenation |
| Form shows blank/empty without error | Short IDs (`pr1`, `btn2`) or all-`root` parentIds | Re-run `stampTree`; ensure `crypto.randomUUID()` IDs |
| Detail form shows blank when navigated to without `?id=` | Normal — `gql` loader has no ID to fetch | This is expected; test detail forms with `?id=<real-guid>` |
| Create/edit fields show as read-only labels (no input boxes) standalone | `editMode: "inherited"` + form not in edit context | Expected — they become inputs inside the Add modal (`formMode: "edit"`) or after Start Edit. Don't "fix" by forcing `editable`. |
| Dropdown opens but shows "No matches" / no options | The backend **reference list has no items**, or wrong `referenceListId` | Verify the reflist name via property metadata; confirm items exist in the backend reflist editor. Config itself (see by-datatype.md) is likely correct. |
| Autocomplete (FK) shows "No matches" | Target entity has no records, or wrong `entityType:{name,module}` | Confirm the FK target short class name + module; ensure records exist. |

## Step 9 — Browser smoke (default; `--no-browser` opts out)

Invoke the playwright skill to load the form, screenshot, and capture console + network errors that JSON validation can't catch (editMode regressions, runtime script failures, broken layout). Recipe in [api.md §12](references/api.md):

```
Skill(skill="playwright", args="<directive from api.md §12, with FRONTEND_URL + form path filled in>")
```

Frontend URL: `adminportal/` (auth forms) or `publicportal/` (anonymous) — read the dev port from `<app>/.env*` or `<app>/package.json`. If neither front-end is running, skip the smoke step and warn the user.

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

## Non-negotiables

- **`datatableContext` (lowercase t) is the correct type** — `dataTableContext` (capital T) is NOT a valid type and silently renders nothing. The clean-form-config index uses `datatableContext`; use that exact string.
- **`datatableContext` requires explicit `entityType` + `sourceType`** — it does NOT inherit from `formSettings.modelType`. A bare `datatableContext` without these props causes HTTP 500 on page load. Mandatory props: `entityType` (same value as `formSettings.modelType`), `sourceType: "Entity"`, `dataFetchingMode: "paging"`, `defaultPageSize: 10`, `uniqueStateId: "<componentName>"`, `componentName: "<name>"`, `propertyName: "<name>"`. Template:
  ```json
  {
    "type": "datatableContext",
    "entityType": "Shesha.Core.Person",
    "sourceType": "Entity",
    "dataFetchingMode": "paging",
    "defaultPageSize": 10,
    "uniqueStateId": "myTable",
    "componentName": "myTable",
    "propertyName": "myTable",
    "sortMode": "standard",
    "allowReordering": "no"
  }
  ```
- **`parentId` on every component** — set to the direct parent's `id`; root-level components get `"root"`. Use `stampTree` (see Step 5). Missing `parentId` or all-`root` parentIds crashes the Shesha renderer with no useful error.
- **`id` must be a real UUID** — use `crypto.randomUUID()` or `uuid.v4()`. Short placeholder IDs like `btn1`, `pr2` are NOT valid; the renderer ignores components with non-UUID ids, causing forms to render blank.
- **CRUD wiring follows the canonical examples (`references/examples.md`), not ad-hoc navigation:**
  - **Table "Add" button** = a `buttonGroup` item with `buttonAction: "dialogue"`, `actionConfiguration.actionName: "Show Dialog"` (owner `shesha.common`), `actionArguments.formId: { name: "<create-form>", module: "<module>" }`, `modalWidth: "60%"`, `formMode: "edit"`. It opens the create form in a **modal** — verified to render the create form's fields inline. Do NOT make Add a Navigate.
  - **Detail-view lifecycle buttons** = a header `buttonGroup`: Edit → `Start Edit`, Save → `Submit`, Cancel → `Cancel Edit` (all owner `shesha.form`); optional Audit Log → `Show Dialog` → `{ name: "entity-change-audit-log", module: "Shesha" }`. The form toggles edit state in place; there is no manual navigate-back Save.
  - **Toolbar Refresh / column-toggle** buttons use `actionName: "Refresh table"` / `"Toggle Columns Selector"` with `actionOwner` set to the **dataContext component's id**.
  - **Row → detail navigation** (only when a separate detail page is wanted): action column item with `columnType: "action"`, `action: "navigate"`, `targetUrl: "/dynamic/<module>/<form>?id={{selectedRow.id}}"`, `icon: "EditOutlined"`.
- **`actionArguments.target`** for plain Navigate actions: `{ actionName: "Navigate", actionOwner: "shesha.common", actionArguments: { target: "/dynamic/..." } }`.
- **Preserve ids** on existing components — fresh GUIDs only on clones / new nodes.
- **`editMode: "inherited"`** on every interactive component (textField, dropdown, button, etc.). Do NOT use `"editable"` — real Shesha forms use `"inherited"` and the form-level context controls edit state. Using `"editable"` explicitly can break form-level edit-mode toggling.
- **JSON-safe script strings** — ALL script values embedded in form JSON must be serialisable without breaking the outer `JSON.stringify`. Rules: (a) no template literals — use string concatenation instead of `` `${x}` ``; (b) no unescaped newlines — use `\n`; (c) no smart/curly quotes — use straight quotes; (d) validate every script-containing component with `node -e "JSON.stringify(comp)"` before push. A broken script string produces `"Expected ',' or '}' after property value"` parse errors in the browser.
- **No `globalState`** for cross-form state. Default to `contexts.appContext` (app-wide) or `pageContext` (inter-page). `localStorage` / `sessionStorage` are OK only when state must survive a hard refresh AND the data is not sensitive (no auth tokens / PII) — see [shared-state.md](references/components/shared-state.md).
- **API calls in scripts**: `try/catch` + `async/await` (no `.then()` chains) — see [scripts.md](references/components/scripts.md).
- **Mustache expressions always use `{{double braces}}`** — e.g. `{{data.id}}`, `{{selectedRow.id}}`. Never write `{data.id}` (single brace). Single-brace expressions are silently ignored at runtime, producing empty values with no error.
- **`access: 5`** on anonymous forms (login, register, OTP). Verify post-push via re-fetch.
- **PowerShell + non-ASCII body**: pass UTF-8 bytes (em dashes / curly quotes trigger server 500 — `Unable to translate bytes [E2] ... from specified code page to Unicode`). Use `[System.Text.Encoding]::UTF8.GetBytes($jsonBody)` or `curl --data-binary @file`. Recipe in [api.md](references/api.md).

## Doc fallback

When you hit an unfamiliar API / component / action, fetch docs first via `WebFetch` instead of guessing — `https://shesha-grads.vercel.app/docs/` for practical how-to ("how do I X"), `https://docs.shesha.io/` for canonical contracts ("what is the contract for X"). Quote field names and gotchas verbatim; cache distillates in `.claude/cache/shesha-form-edit/docs/<topic>.summary.md`. If the token expires (24h default), re-run Step 2.
