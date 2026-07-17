# Renderer physics — version-conditional facts (0.43 vs 0.45)

Live-verified render behaviour that differs between BoxStack 0.43.x and Shesha 0.45.x, plus rules true on both. Every fact here was learned from a real form that silently mis-rendered — these are the facts trial-and-error repair loops rediscover at 1–3 push cycles each. **Detect the generation first** (Step 3: `versionStatus` present → 0.43-class; component KB `_index.json` states its generation), then use ONLY that column's levers.

**The headline: the two generations have OPPOSITE styling levers.** Markup styled with the wrong generation's channels renders unstyled with zero errors.

## The physics table

| Goal | 0.43.x (verified 0.43.33–35) | 0.45.x (verified 0.45.1) |
|---|---|---|
| Container background / border / radius | flat `desktop.background` / `desktop.border` / `radius` are **DEAD**. Only the **`style` fn** renders — `style: "return { background:'#f7f8fa', border:'1px solid #e2e5ea', borderRadius:'8px' };"` | `desktop.*` breakpoint blocks **work** — and override base **per-key** (base `borderType:"custom"` is dead if `desktop.border.borderType:"all"`). Stamp base AND every breakpoint object |
| Size a flex child | `desktop.dimensions.width` is **INERT**. Width goes on the OUTER div via the **`wrapperStyle` fn**: `wrapperStyle: "return { flex:'1 1 0%' };"` (fill) / `"return { flex:'0 0 360px' };"` (rail) | `desktop.dimensions.width` is the **ONLY** lever (accepts `%` and `calc()`). `customStyle:{flex}` is ignored; `style`-channel `flexShrink` never reaches the outer div |
| Style text | `desktop.font` is **DEAD**. Use TOP-LEVEL props: `color` (hex), `fontSize` (Tailwind class, e.g. `text-xs`), `textType:"title"` + `level` | `desktop.font` works. The legacy `style` JS-string still renders inline and **wins over everything** |
| Entity binding shape | `entityType` / `formSettings.modelType` are full-class-name **STRINGS** (`"Shesha.Domain.Person"`). The `{name,module}` object form → HTTP 400 + empty datatable | `formSettings.modelType` is the **`{ name, module }` object**; `dataContext.entityType` stays the fullClassName string |
| Table/list data wrapper | **`datatableContext`** (v7). A component named `dataContext` also exists (v2) but is the app-context component — using it as a wrapper silently breaks data loading | **`dataContext`** (v8) |
| Publish model | Versioned ConfigurationItems: CreateNewVersion → Draft → UpdateStatus 2→3; Live is immutable ([version-lifecycle.md](version-lifecycle.md)) | Mutable forms on test builds: bare `UpdateMarkup` works, `UpdateStatus` may 404, `GetJson` returns the markup object directly (no `.result`) |
| Divider / boxShadow | `style` fn is a **whitelist**: background colour exact; border width/style render but **colour is rewritten to `#6b7280`**; **boxShadow is DROPPED**. Divider = a 1px separator `container` with `style:"return { backgroundColor:'#e2e5ea' };"` + parent `alignItems:'stretch'` | border colour and shadow render from the style channels normally |

## Same on BOTH generations

- **A container renders TWO divs.** The outer div (`sha-components-container`, the actual flex item) receives ONLY `dimensions` (+shadow where supported); layout props (`display`/`justifyContent`/`gap`) and the inner style land on the **inner** div. On 0.43 the `style` fn hits the inner and `wrapperStyle` hits the outer. When a stamped prop doesn't render, first grep the component AND its ancestors for a truthy legacy `style` — inline wins.
- **Container inner overflow is hard-coded `overflow:auto`** — the model's `overflow` prop is a no-op. Fix squeezed/scrolling headers with `dimensions.minHeight:'fit-content'` (valid at runtime; the groups index doesn't list it — don't strip).
- **A stale/absent component `version` silently drops the whole style block** (and can throw in migration). Component versions **drift across point releases** (0.43.33 vs 0.43.35 probes disagree; a cached 0.45 profile disagreed with live by one on `dataContext`) — probe the live backend's existing forms when exactness matters; never trust a cheatsheet across generations.
- **`editMode:"inherited"` renders BLANK in the default view state** of a detail form — read-only rails/KIB strips want `editMode:"readOnly"`; edit-lifecycle inputs want `"inherited"` ([edit-mode.md](components/edit-mode.md)).
- **Field-level `labelCol` is ignored** — only `formSettings.labelCol`/`wrapperCol` applies (field-level `labelAlign` IS honored). `.sha-page-content:not(.no-padding)` carries a hard-coded 12px inset.
- **A bound value renders ONLY when `propertyName` = a real entity property** (it drives the gql fetch). Mutating `data` in `onAfterDataLoad`, or `form.setFieldsValue`, does NOT populate a read-only field's display.
- **Mustache `{{ }}` HTML-escapes** `' & < >` (O'Mally → `O&#39;Mally`); use `{{{triple-brace}}}` for trusted display values. GUIDs are unaffected.
- **`refListStatus` fill colour comes ONLY from the reference-list item's own colour** — no item colour = grey `#fafafa` regardless of `solidBackground`. Radius via the border/radius channel for the generation (0.45: `desktop.border.radius.all`), never `customStyle`.
- **Dynamic CRUD `Update` rejects an FK sent as a nested object** ("not allowed to be updated") — reduce every FK to `{ id }` in `onPrepareSubmitData`.
- **Script runtime:** Execute Script actions must return a Promise (no IIFEs); `http.get(url,{params})` drops `params` — query args go in the URL string; `formArguments`/`selectedRows` are NOT in Execute Script scope (multiselect via `globalState.<contextName>.selectedIds`).
- **0.45 lifecycle hooks:** `onInitialized` is NOT wired (only the header/layout form fires it); custom data loading goes through `onAfterDataLoad` (async-capable, runs unconditionally) — `dataLoaderType:"custom"` is silently skipped whenever the page supplies initialValues (DynamicPage always does).

## Why this file exists

Styling pushed through the wrong generation's channels renders as an unstyled grey form with **zero console errors** — indistinguishable from "the skill designed it badly". Live runs then burn 1–5 push→screenshot→fix cycles rediscovering one row of this table per cycle. Reading this table before authoring (and picking levers by generation) is the difference between one push and five.

Sources: live-verified project memories — AssetManagement 0.43.35 (2026-06/07), RequirementsStudio 0.45.1 (2026-06/07), style-lab probes. Cross-references: [components-kb.md](components-kb.md) (0.43 KB generation note), `shesha-design-system/references/styling-mechanics.md` (0.45 channel mechanics), [version-lifecycle.md](version-lifecycle.md).
