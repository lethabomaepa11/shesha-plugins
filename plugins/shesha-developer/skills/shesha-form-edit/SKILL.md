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
  - Skill
---

# Shesha Form Edit

Round-trip workflow: **GET form JSON → edit → PUT/POST it back**. The user supplies requirements; this skill handles auth, fetch, edit, validate, and push.

Also handles **creating new forms** — `POST /Create` for the FormConfiguration record, `PUT /UpdateMarkup` to set the body. When the user wants a brand-new form, prefer copying the JSON of an existing form with similar layout (e.g. an auth page, an entity-bound details form, a datalist host) and modifying only the parts that differ — designer-output JSON has many style fields that are tedious and error-prone to author from scratch.

Arguments received: `$ARGUMENTS`

---

## Step 1 — Resolve the backend URL

Check, in order, stop at first match:

1. `src/PBF.MembershipManagement.Web.Host/Properties/launchSettings.json` → `profiles.Project.applicationUrl`.
2. `src/PBF.MembershipManagement.Web.Host/appsettings.json` → `Kestrel:Endpoints:Http:Url` if present.
3. Fall back to `http://localhost:21021`.

Strip any trailing slash. Store as `$BASE_URL`.

Quick reachability ping (PowerShell) — if it fails, stop and tell the user to start the backend:

```powershell
try { Invoke-WebRequest -Uri "$BASE_URL/swagger/index.html" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop | Out-Null; "Backend up" } catch { "Backend NOT reachable at $BASE_URL" }
```

---

## Step 2 — Authenticate as admin

Default credentials for this project: **`admin` / `123qwe`**. Don't ask the user — these are local-dev defaults; if auth fails, re-prompt.

```bash
curl -s -X POST "$BASE_URL/api/TokenAuth/Authenticate" \
  -H "Content-Type: application/json" \
  -d '{"userNameOrEmailAddress":"admin","password":"123qwe"}'
```

Extract `result.accessToken` from the response. Store as `$ACCESS_TOKEN`. (Older Shesha builds return the token at the root; check both `.result.accessToken` and `.accessToken`.)

If the call returns no token, surface the raw response and stop.

> **Detailed recipes (auth, fetch, push) live in [api.md](api.md). Reference it inline whenever you build a curl command — don't reconstruct from memory.**

---

## Step 3 — Identify the target form

Ask the user **only what's missing**. Required: form id **OR** (module + name).

> Which form are you editing? Either give me the form **id** (Guid), or **module + name** (e.g. `PBF.MembershipManagement` + `member-create`).

If only module + name are given, resolve to id via `GetByName` ([api.md §3](api.md)). Store as `$FORM_ID`.

---

## Step 4 — Fetch the current markup

Follow [api.md §4](api.md) — `GET /api/services/Shesha/FormConfiguration/GetJson?id=$FORM_ID` with bearer token. Save the response body to `/tmp/form-current.json` (or a local temp dir on Windows: `$env:TEMP\form-current.json`).

The body is a **stringified** form JSON. Parse it: the resulting object has top-level `components` (array, nested tree) and `formSettings` (object). If you receive an envelope like `{ "result": { "markup": "..." } }`, parse `result.markup` as JSON.

---

## Step 5 — Load the component properties index

Read `assets/component-properties.json` from this skill's folder. Structure:

- `_meta` — version + count, skip.
- `base.props` — keys valid on **every** component.
- `base.types` — expected types for base props (when known).
- `_formSettings.props` / `_formSettings.types` — keys/types valid on the `formSettings` object.
- Per-type entries (e.g. `textField`, `dropdown`, `container`) — `{ props: [...], types: {...} }`.

When editing or adding a component:

```
allowedKeys = new Set([...base.props, ...(index[component.type]?.props ?? [])])
typeMap     = { ...base.types, ...(index[component.type]?.types ?? {}) }
```

Use this to verify every key you write is real and every value's type matches. Skip type-checking for keys absent from `typeMap` (ambiguous types) and for `IPropertySetting` wrappers in `_mode: 'code'`.

---

## Step 6 — Apply the user's requirements

The most common edits and how to do them are in [components.md](components.md). Read the section that matches the user's request (it's <600 lines, fast to scan).

Core principles when modifying the JSON tree:

- **Preserve every component's `id`** — never regenerate ids on existing components, or stable references in JS scripts will break. New components get a fresh GUID.
- **Preserve `parentId`** on every component except the moved one — when re-parenting, update only the moved node's `parentId` and add it to the new parent's `components` array.
- Do not touch `formSettings` unless the user asked for a form-level change.
- Property values can be plain (`"Save"`, `42`, `true`) or `IPropertySetting` wrappers `{ "_mode": "value", "_value": ... }` / `{ "_mode": "code", "_code": "..." }`. The wrapper form lets the property be JS-evaluated. Keep wrappers when present; only convert if the user is asking for runtime behaviour.
- Embedded scripts (`onChangeCustom`, `onClickCustom`, `customVisibility`, `customEnabled`, etc.) must be valid JS. The available globals inside scripts include `data`, `formData`, `formMode`, `globalState`, `setFormData`, `application`, `http`, `message`, `moment`, and the standard browser globals. See [components.md §"Script context"](components.md#script-context).
- API calls inside scripts **must** be wrapped in `try/catch` and async contexts must use `async`/`await` (no `.then()` chaining). The `clean-form-config` skill enforces this — invoke it after your edits if any scripts changed.

---

## Step 7 — Validate

Before pushing, run these sanity checks against the modified tree:

1. **Walk the tree** — every component has a unique `id` (Guid string), a `type` (string in the index OR clearly marked custom), and a valid parent chain.
2. **Dead props** — for each component, every non-underscore key must be in `allowedKeys` for that type. Drop or fix any that aren't.
3. **Type checks** — for keys present in `typeMap`, the value's runtime type must match (booleans not `"true"`, numbers not `"42"`).
4. **Dropdown values shape** — for `dropdown`/`radio`/`checkboxGroup`, when `dataSourceType === 'values'`, each item in `values` is `{ id, label, value }` — see [components.md §Dropdowns](components.md#dropdowns).
5. **Scripts** — quick parse with `node --check` on each script string (write to `/tmp/check.js`, run, capture stderr). If any script fails to parse, surface the error and stop.

If anything fails, present the issues to the user before pushing. **Never push a config that fails validation without user confirmation.**

For deeper validation (layout overflow, label-vs-propertyName references, missing try/catch, missing async), invoke the bundled `clean-form-config` skill — it's purpose-built for this:

```
Skill(skill="shesha-developer:clean-form-config", args="<path to your edited form>")
```

---

## Step 8 — Push the change back

Two options. Both work; pick by user preference (default to UpdateMarkup — it's a plain JSON `PUT`, no multipart).

### Option A — UpdateMarkup (default, simplest)

```bash
curl -s -X PUT "$BASE_URL/api/services/Shesha/FormConfiguration/UpdateMarkup" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d @/tmp/update-markup-body.json
```

Body shape: `{ "id": "$FORM_ID", "markup": "<stringified form JSON>" }`. Build it via Node to avoid escaping pain — see [api.md §5](api.md).

### Option B — ImportJson (multipart upload)

`POST /api/services/Shesha/FormConfiguration/ImportJson` with `multipart/form-data`, fields `ItemId` (the form id) and `file` (the form JSON as a file). See [api.md §6](api.md).

Both endpoints write `Markup` on the form configuration. UpdateMarkup is the same code path but takes JSON body; ImportJson exists for the designer's "upload .json file" flow.

A successful response is HTTP 200 with `{ "result": ... }`. On any non-200, surface the raw response and stop.

---

## Step 9 — Confirm + offer next step

Tell the user:

> Form `$FORM_ID` updated. Refresh the form in the designer or front-end to see the changes.

If the user has the front-end running, look up the test URL with the Shesha MCP (`shesha:get_test_url` or similar) if the MCP is connected; otherwise offer module/name so they can navigate manually.

---

## Notes & gotchas

- **Preserve markup as a string** when round-tripping. The form's `markup` column is a string column; the API stores it verbatim. Always `JSON.stringify` your edited tree before sending.
- **No id regeneration**: if the user says "duplicate this section", deep-clone and assign **new** ids on every cloned node, but only on the clones — never touch originals.
- **`formSettings.modelType`** is the entity full name (e.g. `PBF.MembershipManagement.Domain.Domain.Member`). Keep it in sync with the actual entity if you change the form's binding.
- **`editMode: "editable"` on every interactive component** — `textField`, `textArea`, `numberField`, `dateField`, `dropdown`, `radio`, `checkbox`, `switch`, `button`, `link`, `autocomplete`, `entityPicker`. Without it, Shesha may default the component to read-only (especially on forms with `dataLoaderType: "none"` like auth pages) and the user will see a "looks fine but won't accept input/clicks" symptom. Pure visual components (`text`, `image`, `container`, `columns`, `card`) keep `editMode: "inherited"` or omit it. **This rule is non-negotiable.** See [components.md §editMode rule](components.md#editmode-rule).
- **Layout pattern**: pages use **outer container → card → inner container → section sub-containers**. The outer container handles centering/full-viewport sizing; the `card` component is the white-rounded box with `header.components` and `content.components` slots; the inner container is the form-content wrapper; sub-containers act as semantic divs for grouping related rows (e.g. consents block, name row, action row). See [components.md §Layout pattern](components.md#layout-pattern).
- **MCP unreliable**: the Shesha MCP at `localhost:8000/sse` exposes `create_form_configuration` / `update_form_configuration`, but in practice they return `'dict' object has no attribute 'lower'` (Python error inside the MCP server) or JSON-RPC `-32602` "Invalid request parameters" — even for trivial single-field forms with no entity binding. Other MCP tools like `search_entities` / `search_forms` are fine. **Default to the direct-API path in this skill.** If a user explicitly asks to use the MCP, try once; if it fails, fall back without re-prompting.
- **PowerShell + UTF-8**: `Invoke-RestMethod -Body $jsonString` encodes the body as Windows-1252 by default. If the body contains em dashes (`—`), curly quotes, accented characters, or any non-ASCII bytes, the server returns 500 with `Unable to translate bytes [E2] at index N from specified code page to Unicode`. **Always pass the body as UTF-8 bytes:**
  ```powershell
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($jsonBody)
  Invoke-RestMethod -Uri $url -Method Put -Headers $h -Body $bytes -TimeoutSec 60
  ```
  Or sidestep entirely by using `curl --data-binary @file` from Bash.
- **Anonymous-access forms**: set `formSettings.access = 5` on forms that need to be reachable without login (login, register, otp pages). The Create endpoint may not honour `access` on initial create — push the markup once with `Create`, then immediately call `UpdateMarkup` with `access: 5` to lock it in. Anonymous forms are served at `/no-auth/<module>/<form>`; authenticated forms at `/dynamic/<module>/<form>`.
- **Built-in auth actions**: `actionName: "Sign In", actionOwner: "shesha.common"` reads the form's `userNameOrEmailAddress` + `password` fields and calls `TokenAuth/Authenticate`. After success, `actionResponse.url` holds the Shesha-default landing URL. Compose with `onSuccess: { actionName: "Execute Script", actionArguments: { expression: "..." } }` for custom routing. OTP endpoints: `POST /api/services/app/Otp/SendPin` (`{sendTo, sendType: 1=phone | 2=email}`), `POST /Otp/VerifyPin` (`{operationId, pin}`), `POST /Otp/ResendPin` (`{operationId}`). Stash the returned `operationId` in `localStorage` between pages.
- **Don't bypass auth.** If the token expires mid-session (24h default), re-run Step 2.
- **Read [components.md](components.md) before authoring components you haven't used in this session** — it has the IPropertySetting wrapper, script globals, dropdown shapes, validation patterns, and gotchas that aren't obvious from the index.
