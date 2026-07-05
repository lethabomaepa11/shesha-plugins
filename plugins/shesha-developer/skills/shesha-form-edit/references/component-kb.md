# Component Knowledge Base (source-derived)

`assets/components-kb/` is generated directly from the Shesha renderer source
(`src/designer-components/`), so it is **authoritative for the backend generation it was
built from** — see `_meta.json` for branch/commit (currently `releases/0.43`,
commit `d05119d`, 108 toolbox components).

## Precedence

**The KB beats the hand-maintained `references/component-cheatsheet.md` version table and
`assets/groups/*` when they disagree** — those were probe/hand-derived; the KB is
parsed from the renderer itself. This includes the settings-field catalogs: if a group doc
and a component's `settingsFields` disagree about a configurable property, the KB wins.
If the KB and a live-designer probe disagree, trust the probe only if the connected backend
runs a different frontend version than `_meta.json` records.

## Files

- `<type>.json` — one per toolbox component (`textField.json`, `datatableContext.json`, ...):
  - `type` — the exact toolbox type string to use in markup (case-sensitive: e.g. `datalist`, not `dataList`).
  - `version` — CURRENT settings version = highest `.add(N, ...)` index in the component's
    migrator chain. **`version: null` means the component has NO migrator — omit the
    `version` prop entirely in markup; stamping one can be wrong.**
  - `initModel` — what the designer stamps on a fresh drop. `defaults` holds the
    statically-parsed literal keys; `raw` is the source snippet. **Prefer these designer
    defaults over props copied from seed forms.**
  - `settingsProps` — the props interface name/file, its own props, and `resolvedProps`
    (interface + resolvable extends). Best-effort; `unresolvedExtends` lists what couldn't be followed.
  - `slots` — `hostsChildren`, `customContainerNames` (e.g. `['tabs']`, `['columns']`),
    `detectedSlotKeys`, `usesComponentsContainer`.
  - `settingsForm` — `{ source, mechanism, parseQuality }`. Mechanisms in 0.43:
    `json-markup` (settingsForm.json markup file), `fluent-builder` (DesignerToolbarSettings
    chain in settingsForm.ts/settings.ts), `react-factory` (settings.tsx; parsed by grepping
    `<SettingsFormItem name=...>` → `parseQuality: "partial"` — editorType/defaults unknown),
    `none` (component has no settings panel).
  - `settingsFields` — every designer-configurable property: `{ path, label, editorType,
    defaultValue?, group?, description? }`. `path` is the model property the designer writes
    (`validate.required`, `onChangeCustom`, `items`, ...). Panels map to `group`
    (Display / Events / Validation / Style / Security / Data).
  - `hasStandardAppearance` + `appearanceFieldPaths` — which of the shared 0.43 style fields
    this component's settings panel exposes. When `hasStandardAppearance: true` the full
    definitions are NOT repeated in `settingsFields`; look them up in
    `_shared-style-fields.json`. When `false`, any shared fields it does have stay inline
    (marked `shared: true`) and are also listed in `appearanceFieldPaths`.
  - `sourceFiles` — paths relative to `designer-components/` for follow-up reading.
- `_shared-style-fields.json` — the standard 0.43 appearance set (size, height, width,
  hideBorder, borderSize/Radius/Type/Color, backgroundColor, fontSize/Color/Weight,
  `style` custom-CSS script, `stylingBox` margins/paddings JSON string). **0.43 style paths
  are FLAT on the model — there are no `desktop./tablet./mobile.` breakpoint prefixes
  (that structure is 0.45+).** Only set the appearance paths a component actually lists.
- `_index.json` — quick lookup: type → `{ version, name, isInput, file,
  settingsParseQuality, settingsFieldCount, hasStandardAppearance }`.
- `_meta.json` — source dir, branch, commit, dates, component count, settings-catalog stats.
- `_gaps.json` — components where extraction was partial (no migrator indices, unparsed
  initModel, missing interface) with reasons — verify those manually before relying on them.

## Regenerating (e.g. for 0.45)

From the skill root, point argv[2] at that version's `designer-components` dir:

```
node scripts/generate-component-kb.js "C:/Users/Hashim/Documents/Git Repos/shesha-framework/shesha-reactjs-043/shesha-reactjs/src/designer-components" "assets/components-kb"
```

For 0.45, swap the source path to the 0.45 worktree's
`.../shesha-reactjs/src/designer-components`. The script is deterministic and re-runnable;
it never modifies the source tree. No npm deps (plain `node`, ESM).

## 0.43 naming notes

- The data-table wrapper is **`datatableContext`** (folder `dataTable/tableContext/`);
  `dataContext` is the separate app/data-context component (folder `dataContextComponent/`).
- Validation errors component type is exactly **`validationErrors`** (version 0).
