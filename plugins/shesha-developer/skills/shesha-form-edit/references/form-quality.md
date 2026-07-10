# Form quality floor (always-on construction rules)

Build these into EVERY form from the first component; walk them again as your **pre-push gate**.
Terse by design — rationale, silent-failure symptoms, defects and the project worked example are
in the detailed grading companion → [form-quality-rubric.md](form-quality-rubric.md); read that
only when a check is ambiguous or when auditing/grading a form. Deeper refs: components per data
type [components/by-datatype.md](components/by-datatype.md) · editMode
[components/edit-mode.md](components/edit-mode.md) · symptom→fix [debug.md](debug.md) · render
checks [verification.md](verification.md).

## Functional

- **Display component matches the requested noun** — "list"/cards/tiles/gallery ⇒ `datalist`; "table"/grid ⇒ `datatable`; both bound through a `dataContext`. Never a bound collection as stacked static `container` cards. Multi-select list ⇒ `selectionMode: "multiple"`. Ambiguous noun ⇒ ask, don't guess.
- **From a design, the component matches what the design RENDERS**, not the data-shape default — repeating cards/chips ⇒ `datalist` row-template; `datatable` only for a genuine dense admin grid; read-only label→value rail ⇒ read-only display controls; status value ⇒ `refListStatus` chip, not a dropdown.
- **`formSettings.modelType` = object `{ "name", "module" }`**, with `name`+`module` (and the `fullClassName` for metadata) resolved from `EntityConfig/GetMainDataList` on THIS backend every time — never an assumed namespace (`Core` vs `Domain` is version-dependent), never an invented name. Confirm properties via `Metadata/GetProperties?container=<fullClassName>` before building.
- **Every input binds a non-empty `propertyName`** that exists in metadata.
- **Every `propertyName` is camelCase — including datatable COLUMN `propertyName`s** (metadata `path` is PascalCase; PascalCase columns render blank cells). Lower-case the first letter (`ActionedBy`→`actionedBy`).
- **Required fields carry `validate: { "required": true }`.**
- **Every dropdown declares `dataSourceType`** (missing/wrong fails silently): reference list ⇒ `referenceList` + `referenceListId: { module, name }` (object, both keys, never a Guid/name-only); entity FK ⇒ `entitiesList` + `entityType` (prefer `autocomplete`); fixed options ⇒ `values: [{ id, label, value }]`. Read the reflist `name` from metadata (strip the `RefList` prefix) — it doesn't always match the property.
- **Date properties use `dateField`** (`showTime: true` for date-time) — never `textField`/`numberField`.
- **A Submit action exists** — `actionConfiguration: { "actionName": "Submit", "actionOwner": "shesha.form" }` (or a dialog footer submit). `actionOwner` is case-sensitive: `shesha.form`/`shesha.common`.
- **Every form with a Submit also has a paired exit button** — implied by ANY create/edit intent, even when the prompt names no buttons. Standalone page ⇒ **Back** (`Navigate`/`shesha.common`); modal ⇒ `Close Dialog` (`shesha.common`); detail ⇒ `Cancel Edit` (`shesha.form`).
- **`validationErrors` component is ALWAYS in the tree** (above the action row) once the form has any required input. Type string exactly `validationErrors`, no props.
- **`editMode` matches the form type** — detail forms on Start Edit/Submit/Cancel ⇒ `inherited`; a read-only rail that must always show values ⇒ `editMode: "readOnly"` per control (`inherited` renders blank until edit mode).
- **No duplicate ids tree-wide; no double-slot card children** — `card`/`collapsiblePanel` children live in `content.components` ONLY, never also in a top-level `components[]`.

## Layout & action

> Construction only — the LOOK (surfaces, shadows, spacing, radii, type scale) is owned by `shesha-design-system`. Do not author v7 appearance blocks here.

- **Follow the canonical build style** — labels on top for create/edit + modals (horizontal right-aligned label cols only on read-only detail views); action rows right-aligned (Cancel ghost before Submit primary); card-per-section with header strips; table toolbars with quick-search + ghost Add; main+rail split. Shapes + measurements: `shesha-design-system/references/default-layout-patterns.md`.
- **Group fields into sections** the design shows, or by IA (identity/classification/audit/free-text) — each group a flex `container` row (split via `desktop.dimensions.width`, **never** `columns`), `tabs`, `sectionSeparator`, or `card`+header. Trigger = ">1 logical group", not raw field count. Keep related fields together.
- **Every label is human-readable English** (`"First Name"`, never `firstName`) — labels are the automation handle for browser tests.
- **Action buttons live in a `buttonGroup`, never standalone `button` nodes** (GUARDRAIL) — tooling reads form intent from `buttonGroup` items. Items = `{ itemType: "item", itemSubType: "button", buttonType, buttonAction, actionConfiguration }`. Multiple `buttonGroup`s OK across distinct zones (header/footer/toolbar). Copy from an `assets/examples/` seed.
- **Every far-right element in a table's header zone aligns flush with the table's right edge** — toolbar row = full-width flex, `justifyContent:"flex-end"` (or `"space-between"` with a left search cluster); `justifyContent` needs an explicit `display:"flex"`; force full width via `desktop.dimensions.width:"100%"` (0.45) / `style: "return { width: '100%' };"` (0.43). Copy from a canonical table seed.
- **One primary per action zone** — one `buttonType: "primary"` reachable in the default state per visible zone; never two inside the same `buttonGroup`.
- **Add only what the request needs — no padding.** Floor per editable form = inputs + one `validationErrors` + one `buttonGroup` (Submit **and** exit) + minimal structure (a `columns`/`sectionSeparator` only when >5 inputs). Delete unused seed nodes, but never the `validationErrors` or the Submit/exit pair.
- **Destructive actions (Delete/Cancel/Reset) are NEVER primary** — `default`/`link` styling. Primary is reserved for the main forward action.
- **Appearance floor (presence check)** — a no-brand form still ships the default-theme markers: canvas page background (`#F8F8F9`), white hairline card surfaces, titles with `fontSize`+`fontWeight`, one primary in the action group. HOW is `shesha-design-system`'s Step 6.5 pass; THAT it happened is a construction check. Exempt only if a brand/blueprint pipeline styled it.
- **One layout grid** — `formSettings.layout` + `labelCol`/`wrapperCol` set once at form level. Field-level `labelCol` is silently ignored; align a lone full-width field by placing it in a 50% column.
- **Titles carry explicit `fontSize`+`fontWeight`** sized to role — page title 24/`600` (`700` if bold), card header 16/`600`, section header 13–14/`600`.
- **Nothing clips or overflows** — fix a squeezed container with `dimensions.minHeight: 'fit-content'` (clean-form-config may flag it; do NOT strip). Verify with `getBoundingClientRect` after clearing the FE IndexedDB form cache ([verification.md](verification.md)).

---

Related: [form-quality-rubric.md](form-quality-rubric.md) (detailed grading companion) ·
[detail-page-pattern.md](detail-page-pattern.md) · [navigation-menu.md](navigation-menu.md) ·
[bulk-operations.md](bulk-operations.md)
