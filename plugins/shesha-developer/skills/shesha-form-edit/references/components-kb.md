# Component knowledge — KB (source-derived) + quick shapes

One catalog, two generations. `assets/components-kb/` is **generated from the Shesha renderer source** and is authoritative for the generation it was built from (`_meta.json` — currently `releases/0.43`, 108 components). The quick-shapes section below carries the **0.45.x probe values**. Pick by the target backend's generation ([renderer-physics.md](renderer-physics.md) — detect via `versionStatus`); when any hand table and the KB disagree *for the KB's generation*, **the KB wins** (it beats this file's tables and `assets/groups/*`, including settings-field catalogs). If the KB and a live-designer probe disagree, trust the probe only when the backend runs a different frontend version than `_meta.json` records.

> Universal (both generations): every component carries its integer `version` (a versionless component re-runs the whole legacy migration chain and can throw `e.match` / `reading 'migrator'` / `reading 'version'`); `parentId` on every node (root-level → `"root"`); `id` is a real UUID.

## KB files (`assets/components-kb/`)

- `<type>.json` — one per toolbox component:
  - `type` — exact toolbox type string (case-sensitive: `datalist`, not `dataList`).
  - `version` — CURRENT settings version = highest `.add(N, …)` in the migrator chain. **`version: null` = no migrator — OMIT the `version` prop; stamping one can be wrong.**
  - `initModel` — what the designer stamps on a fresh drop (`defaults` = parsed literals). **Prefer these over props copied from seed forms.**
  - `settingsProps` / `settingsFields` — every designer-configurable property (`path`, `label`, `editorType`, `defaultValue`, `group`). Author only fields that exist here.
  - `slots` — `hostsChildren`, `customContainerNames` (`['tabs']`, `['columns']`), `detectedSlotKeys`.
  - `settingsForm.parseQuality` — `"partial"` (react-factory) means editorType/defaults unknown; verify manually.
  - `hasStandardAppearance` + `appearanceFieldPaths` — shared 0.43 style fields live in `_shared-style-fields.json`, not repeated per component.
- `_shared-style-fields.json` — the standard 0.43 appearance set. **0.43 style paths are FLAT on the model — no `desktop./tablet./mobile.` prefixes (that structure is 0.45+).**
- `_index.json` — quick lookup type → `{ version, isInput, settingsFieldCount, … }`. `_meta.json` — branch/commit. `_gaps.json` — partial extractions to verify manually.

**0.43 naming:** the table/list wrapper is **`datatableContext`**; `dataContext` is the separate app-context component. `validationErrors` is version 0 (it has a migrator — stamp the 0).

**Regenerating for another generation:** `node scripts/generate-component-kb.js <path to that version's designer-components> assets/components-kb` — deterministic, no deps.

## Quick shapes + versions (0.45.x probe values)

Enough to author a table/create/detail form without opening any seed: **cheatsheet → block library → lean seed** is the default path. Never read a multi-100KB seed wholesale — `Grep` one fragment with tight `-A/-B`.

| type | ver | type | ver | type | ver |
|---|---|---|---|---|---|
| `container` | 7 | `datatable` | 29 | `button` | 9 |
| `columns` | 5 | `dataContext` | 8 | `buttonGroup` | 15 |
| `text` | 5 | `datalist` | 11 | `alert` | 2 |
| `textField` | 6 | `datatable.pager` | 4 | `collapsiblePanel` | 7 |
| `textArea` | 5 | `datatable.quickSearch` | 3 | `refListStatus` | 3* |
| `numberField` | 3 | `tableViewSelector` | 2 | `checkbox` | 5 |
| `dateField` | 7 | `autocomplete` | 8 | `checkboxGroup` | 5 |
| `dropdown` | 7 | | | | |

\* live 0.45 backends have probed `refListStatus 6` and `dataContext 7` — versions drift across point releases; when exactness matters, resolve from the running app's existing forms and trust that. **Stale-version guard:** an old form may carry a lower version (a `datatable` at v11) — that is its un-migrated state; never copy it forward.

```jsonc
// input (string). number→numberField(v3), date→dateField(v7); same skeleton.
{ "id": "<uuid>", "type": "textField", "version": 6, "parentId": "<pid>",
  "propertyName": "name", "componentName": "name", "label": "Name", "editMode": "inherited", "textType": "text" }

// reference-list dropdown — referenceListId copied verbatim from metadata (entity-binding.md §5)
{ "id": "<uuid>", "type": "dropdown", "version": 7, "parentId": "<pid>", "propertyName": "status", "label": "Status",
  "editMode": "inherited", "dataSourceType": "referenceList",
  "referenceListId": { "module": "<mod>", "name": "<ReflistName>" }, "valueFormat": "simple", "mode": "single" }

// entity FK autocomplete
{ "id": "<uuid>", "type": "autocomplete", "version": 8, "parentId": "<pid>", "propertyName": "assignedTo", "label": "Assigned To",
  "editMode": "inherited", "dataSourceType": "entitiesList", "entityType": { "name": "Person", "module": "Shesha" }, "mode": "single" }

// checkboxGroup (hardcoded) — items, NOT values; each {label,value}
{ "id": "<uuid>", "type": "checkboxGroup", "version": 5, "parentId": "<pid>", "propertyName": "tags", "label": "Tags",
  "dataSourceType": "values", "mode": "multiple", "referenceListId": null, "container": {}, "validate": {},
  "items": [ { "label": "A", "value": "a" } ] }

// dataContext (0.45 wrapper for datatable/datalist — explicit entityType + sourceType mandatory)
{ "id": "<uuid>", "type": "dataContext", "version": 8, "parentId": "<pid>",
  "entityType": "<resolved fullClassName string>", "sourceType": "Entity", "dataFetchingMode": "paging",
  "defaultPageSize": 10, "uniqueStateId": "<name>", "componentName": "<name>", "propertyName": "<name>" }

// buttonGroup (action buttons NEVER as standalone `button` in a toolbar)
{ "id": "<uuid>", "type": "buttonGroup", "version": 15, "parentId": "<pid>", "isInline": true, "editMode": "editable",
  "items": [ { "id": "<uuid>", "itemType": "item", "itemSubType": "button", "label": "Add", "buttonType": "primary",
    "actionConfiguration": { "_type": "action-config", "actionName": "Show Dialog", "actionOwner": "shesha.common",
      "actionArguments": { "formId": { "name": "<create-form>", "module": "<mod>" }, "modalWidth": "60%" } } } ] }

// datatable (v29) — COLUMNS LIVE IN `items[]`, NEVER a `columns` property.
// An empty/absent `columns` is NORMAL, not "broken". Wrap in a dataContext (above).
{ "id": "<uuid>", "type": "datatable", "version": 29, "parentId": "<pid>",
  "propertyName": "table1", "componentName": "table1",
  "items": [
    { "id": "<uuid>", "columnType": "data", "itemType": "item", "propertyName": "<camelCaseProp>",
      "caption": "<Header>", "isVisible": true, "sortOrder": 0, "minWidth": 150, "maxWidth": 250,
      "allowSorting": true, "displayComponent": { "type": "[default]" } },
    { "id": "<uuid>", "columnType": "crud-operations", "itemType": "item", "caption": "", "isVisible": true, "sortOrder": -1 }
  ] }
```

Column `columnType` is `"data"` (camelCase `propertyName`) or `"crud-operations"`; inline editors → [components/inline-editable-tables.md](components/inline-editable-tables.md).
