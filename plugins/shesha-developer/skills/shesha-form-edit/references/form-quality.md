# Form quality contract (always-on construction rules)

Apply to EVERY form you build or edit. These are construction rules, not a post-hoc test
sheet — any Shesha form QA process (human reviewer or browser-driven automation) grades
against exactly these properties, so build them in from the first component.

Component selection per data type: [components/by-datatype.md](components/by-datatype.md) ·
editMode per form type: [components/edit-mode.md](components/edit-mode.md) ·
symptom→fix catalog: [debug.md](debug.md) · render checks: [verification.md](verification.md).

---

## Functional rules

**The display component matches the requested noun.** A request for a **"list"** of records
(or "cards", "feed", "tiles", "gallery", "directory") is satisfied by a `datalist` (card view);
a request for a **"table"** / "grid" / "spreadsheet" by a `datatable` (column grid) — both bound
through a `dataContext`. A bound **entity collection** rendered as stacked static `container`
cards is a **defect** (static containers don't page / filter / select / bind). (A *non-collection*
surface the design shows as a card — a summary panel, a KIB stat, a related-panel shell — is
legitimately a styled `container`/`card`; that's a `shesha-design-system` surface recipe, not a
bound list.) "Select
multiple" in a *list* is `selectionMode: "multiple"` on the `datalist`, not a switch to a table.
When the prompt names neither noun and the layout is ambiguous, the right component was chosen by
**asking** the user, not guessing. See [components/data-tables.md](components/data-tables.md).

**When building from a design or blueprint, the component matches what the design RENDERS — not the default for the data shape.** A blueprint `datalist panel` / a design that shows repeating **cards or chips** (rich item cards, count-badged related panels, chip rows) is a `datalist` row-template — a related collection rendered as a `datatable` is a **placement defect** even though a grid would also hold the rows. Reserve `datatable` for a genuine dense admin grid (sortable columns, "manage X"). Likewise a **read-only attribute rail** (label → value pairs in a detail summary) is read-only display controls, not editable inputs (see the `editMode` rule below) — and a status value is a `refListStatus` chip, not a dropdown.

**Bind to a real entity — favouring the object shape.** Write `formSettings.modelType` as the
object **`{ "name": "<ShortClass>", "module": "<Module>" }`** (e.g. `{ "name": "Person",
"module": "Shesha" }`), the shape current Shesha builds emit; a bare full-class-name string
still renders on legacy forms but is not what to author. Resolve `name`+`module` — and the
`fullClassName` string you still need for the metadata fetch — from
`GET /api/services/app/EntityConfig/GetMainDataList` for the running backend, every time;
never assume or copy a namespace from memory or examples. The same entity is
registered under different namespaces across versions (`Person` is `Shesha.Domain.Person` on
current builds, `Shesha.Core.Person` on older ones; some backends carry both) — a mismatch
500/404s at runtime. Confirm the resolved class exposes
properties via `GET /api/services/app/Metadata/GetProperties?container=<resolved fullClassName>`
(the `container` param is the class-name string, not the object) BEFORE building. Never an
invented/guessed name. Entity class names diverge
from FK property names (`<fkProp>` can map to class `<FkPropDefinition>`) — when metadata
404s, the EntityConfig `fullClassName` is the authority.
Backend missing entirely? [full-stack-prereqs.md](full-stack-prereqs.md).

**Every input binds a property.** Non-empty `propertyName` (camelCase metadata path) on
every input component. An unbound input renders fine but silently drops its value from the
submit payload — invisible until data goes missing.

**Every `propertyName` is camelCase — including datatable COLUMN `propertyName`s.** The entity's GQL field keys are camelCase, but `Metadata/GetProperties` returns the `path` in **PascalCase** (`ActionedBy`, `CreationTime`). Copy it verbatim into a column and the table fetches data + shows the right row count, yet every **cell renders blank** (the cell accessor reads the literal PascalCase key against camelCase rows). Lower-case the first letter of every `propertyName` (`ActionedBy`→`actionedBy`).

**Required means `validate.required`.** Fields the requirements call required carry
`validate: { "required": true }`. Without it the user discovers the rule via a server 400
after filling the whole form. More validators (minLength, regExp): [components/inputs.md](components/inputs.md).

**Every dropdown declares its data source.** `dataSourceType` is never omitted — a missing
or wrong source fails *silently* (empty dropdown, no console error):

| Field kind | `dataSourceType` | Mandatory config |
|---|---|---|
| Enum / reference list | `referenceList` | `referenceListId: { "module": "<module>", "name": "<RefListName>" }` — an object with BOTH keys, never a Guid, never name-only |
| Entity FK | `entitiesList` | `entityType` for the target entity (an `autocomplete` is usually the better FK component — see [components/by-datatype.md](components/by-datatype.md)) |
| Fixed inline options | `values` | `values: [ { "id": ..., "label": ..., "value": ... } ]` — all three keys per item |

Read `referenceListName` from the property metadata (strip the `RefList` prefix); reflist
names do NOT always match property names. Details: [components/dropdowns.md](components/dropdowns.md).

**Dates get `dateField`.** Any date / date-time property uses `dateField` (`showTime: true`
for date-time) — never `textField` or `numberField`, which lose the picker and break the
ISO round-trip.

**A Submit action exists.** A Save/Submit button with
`actionConfiguration: { "actionName": "Submit", "actionOwner": "shesha.form" }`.
Dialog-hosted create forms may instead rely on the Show Dialog footer submit — see
[components/add-dialogs.md](components/add-dialogs.md). `actionOwner` is case-sensitive:
`shesha.form` / `shesha.common`, never `Shesha.Common`.

**Every form with a Submit also has an exit action — even when the prompt never mentions
buttons.** A user who can save must be able to leave without saving, so the exit button is
half of the action row, not an optional extra. The catch: a terse prompt like *"a form with
one required first-name field"* names no buttons at all, so it's easy to emit only the
Submit and stop — which leaves the form with no way to dismiss without saving (an incomplete,
trapped form). Treat the exit button as implied by *any* create/edit intent. Which exit action depends on how the form is hosted:

- **Standalone page** (a create/edit view the user opens directly — the default for "make a
  form for X"): a **Back** button — `buttonAction: "navigate"`,
  `actionConfiguration: { actionName: "Navigate", actionOwner: "shesha.common" }` pointing at
  the entity's list/table form. This is the most-forgotten case; copy
  [assets/examples/standalone-create.json](../assets/examples/standalone-create.json).
- **Modal/dialog form**: `Close Dialog` (owner `shesha.common`).
- **Detail form** with a Start Edit/Submit lifecycle: `Cancel Edit` (owner `shesha.form`).

A form you can save but not back out of is broken, not minimal — the minimalism rule below
explicitly exempts the exit button from "unnecessary extras".

**A `validationErrors` component is ALWAYS in the tree** (conventionally just above the
action row) — mandatory the moment the form has **any required input**. Without it, a failed
submit renders nothing — the form looks dead, with no surfaced validation messages. Type string is exactly
`validationErrors`, it takes no props, and it belongs on simple forms too — not just complex
ones.

**`editMode` matches the form type.** Inputs on detail forms governed by
Start Edit/Submit/Cancel Edit use `inherited` (explicit `editable` makes fields editable
before Edit is clicked). **But a read-only attribute rail that must ALWAYS show its values —
a detail summary the user reads, not a section they edit inline — uses `editMode: "readOnly"`
per control, NOT `"inherited"`.** `inherited` defers to form mode and renders **blank** in the
default (non-edit) view state, so an entity/reflist field shows an empty cell until the form
enters edit mode (the "rail labels with no values" defect); `readOnly` resolves and displays the
`_displayName` immediately. Full decision table: [components/edit-mode.md](components/edit-mode.md).

**No duplicate ids; no double-slot card children.** Every component `id` is unique across the
WHOLE tree — the renderer keys components by id, so a collision renders one twice / drops the
other. A `card` (and `collapsiblePanel`) holds its children in its **`content.components`** slot
ONLY — never *also* in a top-level `components[]`. A container→card migration that left the old
children in `components[]` while the slot is `content.components` makes the card render its body
**twice** (often with identical ids → a collision too): the "everything shows 2–4×" defect. Before
push, assert (a) ids are unique tree-wide, and (b) no `card`/`collapsiblePanel` has children in
both `content.components` and `components[]` — if it does, keep `content.components`, empty the other.

---

## Layout & action rules

> These are *construction* rules — how the form is assembled and behaves. The **look** of a form (surfaces, backgrounds, shadows, layering, spacing values, radii, type scale) is owned by `shesha-design-system` — see its `appearance-quality.md` + `component-recipes.md`. A structural build applies the rules below; it does **not** author v7 appearance blocks.

**Construction follows the canonical build style.** The default structural conventions — labels **on top** in create/edit forms and modals (horizontal 170–200px right-aligned label columns only on read-only detail views), action rows **right-aligned** (Cancel ghost before Submit primary), **card-per-section** grouping with header strips, table toolbars with quick-search + a ghost Add button, main+rail splits at rail ≈332px / gap 24 — are specified with measurements in `shesha-design-system/references/default-layout-patterns.md`. Structure to those shapes; the styling pass then only has to recolour them.

**Group fields into sections.** Build the sections the design shows — or, absent a design, group by information architecture (identity / classification / audit / free-text). Each group is a flex `container` row (split via `desktop.dimensions.width` — **never** `columns`), a `tabs` set, a `sectionSeparator`, or a `card`+section-header. The trigger is *"the design groups them"* or *">1 logical group exists"* — **not a raw field count**: a 4-field form with two clear groups gets two sections; a 7-field form that is genuinely one list stays one column. A flat wall of unrelated fields reads as machine-generated. (How the sections *look* is `shesha-design-system`.) Shapes: [components/containers.md](components/containers.md).

**Group related fields under the same container/section.** Address parts together,
audit/devops fields together, free-text spec fields together. Grouping is the form's
information architecture — random field order reads as machine-generated.

**Every label is human-readable English.** `"First Name"`, never `firstName` or
`moduleDefinitionId`. Labels are also the automation handle: browser-based functional
tests locate fields **by label text**, so a raw propertyName label breaks both the human
read and the test run.

**Action buttons live in a `buttonGroup`, never as standalone `button` nodes** (GUARDRAIL). Save,
Back, Cancel, Edit, Delete, Refresh, Add are `items[]` inside a `buttonGroup`
(`{ itemType: "item", itemSubType: "button", buttonType, buttonAction, actionConfiguration }`),
not loose top-level `button` components. The standalone `button` type is reserved for a button
placed inline beside text/content — not the form's action row. A form **MAY carry more than one
`buttonGroup`** when the design puts actions in distinct zones — e.g. a header group (Edit/Audit)
and a footer group (Save/Cancel), or a table toolbar group plus a row-action group; within each
zone all buttons stay grouped. Copy a `buttonGroup` from a seed in `assets/examples/` rather than
hand-authoring the item shape.

This is the highest-leverage construction rule because tooling reads a form's
*intent* (create / edit / details / read-only) **largely from `buttonGroup` item actions** —
a standalone `button` is easy to miss. A loose `button`, or a Save wired to
anything other than `actionName: "Submit"` + `actionOwner: "shesha.form"`, causes three
problems from one mistake: the scattered button reads as ungrouped/inconsistent layout; the form can be
**misread as read-only** (no detectable edit intent); and the submit action never fires.
So the Save item must be exactly
`actionName: "Submit"`, `actionOwner: "shesha.form"`; a Back item is `actionName: "Navigate"`,
`actionOwner: "shesha.common"`; Cancel-on-details is `Cancel Edit` / `shesha.form`.

**One primary per action zone.** Each visible action zone has exactly one `buttonType: "primary"`
— the zone's main forward action — reachable in the default state (not hidden in a collapsed panel
or a non-default tab). With split toolbars (above) a header zone and a footer zone may each have
their own primary (e.g. header *Edit*, footer *Save*) — one-per-zone, which is correct. What stays
banned: two primaries competing **inside the same `buttonGroup`**.

**Add only what the request needs — no padding.** Component count should match the request's
complexity. Every editable form has a fixed floor, no matter how terse the prompt: the input
fields + one `validationErrors` + one `buttonGroup` holding **both** Submit **and** an exit
(Back/Close/Cancel) button + the minimum structure (one `columns`/`sectionSeparator` only when
>5 inputs). A prompt that names only fields — *"a form with one required first-name field"* —
still gets the Submit **and** the exit button: they are part of a working form, never
"unnecessary extras". A Submit with no exit button is the defect (an incomplete, trapped form),
not an example of minimalism.

What minimalism actually rules out is structure the request didn't call for: extra containers,
decorative panels, duplicate wrappers, headers the user never asked for, or (for tables)
unrequested toolbar chrome. Seeds are a starting point, not a floor — after copying a seed, delete every node the
current request doesn't use, but never the `validationErrors` or the Submit/exit pair.

**Destructive actions are NEVER primary.** Delete / Cancel / Reset get `default` or `link`
styling (e.g. `link` + `DeleteOutlined` icon). Primary is reserved for the main
forward action (Save/Submit).

**Appearance floor (presence check, not a styling guide).** A form built with no brand/design
source must still show the default-theme markers when it ships: page root carries the canvas
background (`#F8F8F9`), section surfaces are white hairline cards, titles carry
`fontSize`+`fontWeight`, and the action `buttonGroup` has exactly one primary. HOW those values
are authored is `shesha-design-system`'s job (the Step 6.5 quick pass,
`shesha-design-system/references/default-theme-quickpass.md`); that the pass HAPPENED is a
construction-level check — an all-default unstyled tree is a defect, the same class as a missing
`validationErrors`. Exempt only when a brand/blueprint pipeline styled the form instead.

**One layout grid.** `formSettings.layout` + `labelCol`/`wrapperCol` are set once at form
level and stay consistent. Field-level `labelCol` is silently IGNORED by the renderer — to
align a lone full-width field with a 2-column grid, place it in a 50% column instead (see
[detail-page-pattern.md](detail-page-pattern.md)).

**A title/header `text` carries explicit `fontSize` + `fontWeight`, sized to its role** — page
title `text-2xl`/24/`600` (`700` if the design's title is bold), card header `text-base`/16/`600`,
section header `text-sm`/13–14/`600`. Unstyled headers render at body size and the page loses its
hierarchy. (The header's *surface* treatment — band background, bottom hairline — is the
`page-title-band` recipe in `shesha-design-system`.)

**Nothing clips or overflows at render.** Container inner divs are hard-coded
`overflow:auto` — flex-shrink squeeze turns squeezed headers into scrollbars. Fix the
squeezed container with `dimensions.minHeight: 'fit-content'` (runtime-verified;
`minHeight` under `dimensions` is not enumerated in the groups index — clean-form-config
may flag it; do NOT strip). `dimensions` is the only style channel reaching the container's
outer div — a `style`-string `flexShrink:0` lands on the inner div and does nothing
([style-channels.md](style-channels.md)). Verify geometry with `getBoundingClientRect`,
not screenshots, and clear the FE IndexedDB form cache from a static page (e.g.
`/favicon.ico`) first or stale markup will lie to you ([verification.md](verification.md)).

---

## Checklist before push

- [ ] display component matches the requested noun — "list"/cards ⇒ `datalist`, "table"/"grid" ⇒ `datatable`; never static stacked `container` cards for a list; multi-select list ⇒ `selectionMode: "multiple"`- [ ] every `propertyName` is camelCase (incl. datatable column `propertyName`s) — metadata `path` is PascalCase; PascalCase columns render blank cells
- [ ] `modelType` = the object `{ name, module }`, with `name`+`module` resolved from `EntityConfig/GetMainDataList` for this backend (no assumed `Core`/`Domain` namespace, no invented names; legacy string form tolerated but author the object)
- [ ] component matches what the design/blueprint RENDERS — a `datalist panel` / card list builds a `datalist` row-template, never a `datatable`; a read-only rail uses `readOnly` controls + `refListStatus` chips
- [ ] no duplicate component ids tree-wide; no `card`/`collapsiblePanel` with children in BOTH `content.components` and a top-level `components[]` (renders twice)
- [ ] every input has a non-empty camelCase `propertyName` that exists in metadata
- [ ] required fields carry `validate.required: true`
- [ ] every dropdown has `dataSourceType`; reflists have `referenceListId` `{module, name}`
- [ ] date properties use `dateField` (`showTime` for date-time)
- [ ] Submit action (`Submit` / `shesha.form` or dialog footer) **and** a paired exit button on every editable form — standalone page → Back (`Navigate` / `shesha.common`), modal → `Close Dialog`, detail → `Cancel Edit` — even when the prompt never mentions buttons
- [ ] `validationErrors` component present whenever the form has any required input
- [ ] all action buttons wrapped in a `buttonGroup` (no standalone `button` nodes in the action row) — multiple `buttonGroup`s OK across distinct zones (header/footer/toolbar)
- [ ] component count matches the request — no padding containers/panels/wrappers; tables add no unrequested toolbar chrome
- [ ] fields grouped into the design's sections (or by IA); related fields together — flex containers, never `columns`
- [ ] labels human-readable; one primary per action zone; destructive never primary
- [ ] consistent `layout`/`labelCol`; titled header has `fontSize`+`fontWeight`; no clipping/overflow
- [ ] appearance floor: default `shesha` theme pass applied (canvas page background, white hairline card surfaces, styled titles) — unless a brand/blueprint pipeline styled the form

---

### Worked example (project-specific)

RequirementsStudio (`Shesha.RequirementsStudio`) instances of the rules above:

- `modelType: "Shesha.RequirementsStudio.Domain.ModuleDefinition"` — verified via
  `Metadata/GetProperties`. Divergence case: the `release` FK property maps to entity class
  `ReleaseDefinition`; `Shesha.RequirementsStudio.Domain.Release` returns 404.
- Status dropdowns: `referenceListId: { "module": "Shesha.RequirementsStudio", "name": "RsStatus" }`
  (`status` is always `RsStatus`). Counter-example: `existsInDevOps` binds reflist
  `RsDevOpsStatus`, NOT `RsExistsInDevOps` — the wrong name threw a
  `ConfigurationLoadingError` that blocked the whole form.
- Required-FK preset in add dialogs: `baseProject` must be injected via
  `formSettings.onPrepareSubmitData` — `setFieldsValue` alone never survives submit
  ([components/add-dialogs.md](components/add-dialogs.md)).
- Status chip: border `1px` `#d9d9d9`, radius 4; chip FILL color is data-driven per
  reflist value — never force a uniform color.
- Subtable drill-down action column: `EyeOutlined`, `minWidth`/`maxWidth` 35, anchored
  left; toolbar alignment via the `sha-index-table-control` framework class
  ([junction-subtables.md](junction-subtables.md)).
- Detail grid: `formSettings.labelCol: 8` / `wrapperCol: 16`, `layout: "horizontal"` on
  every `*-details` form — the shared grid that makes labels line up across columns.

---

Related: [components/by-datatype.md](components/by-datatype.md) ·
[components/edit-mode.md](components/edit-mode.md) · [debug.md](debug.md) ·
[verification.md](verification.md) · [detail-page-pattern.md](detail-page-pattern.md) ·
[navigation-menu.md](navigation-menu.md) · [bulk-operations.md](bulk-operations.md)
