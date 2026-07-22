# Golden Form Corpus

Production-quality Shesha form markup extracted verbatim from the `pd-assetmanagement2` application (its `.shaconfig` config-migration packages). Each `<archetype>--<original-name>.json` file wraps the unescaped `Markup` components tree in a small metadata envelope (`archetype`, `source`, `extracted`, `markup`). See `_index.json` for the archetype catalogue, entity types, component inventories, and structural summaries.

## How to use

**When creating a new form, do not scaffold from scratch. Clone the closest archetype, then adapt it:**

1. Pick the archetype matching the target screen type (table/worklist, detail view, list with stat cards, queue with stat cards, report screen, add form, modal dialog) via `_index.json`.
2. Copy the `markup` tree wholesale as the starting point.
3. Adapt only what must change: `entityType` / `modelType`, datatable columns, property bindings (`propertyName`), labels, visibility/expression logic, and toolbar actions.
4. Regenerate all component `id`s for the new form.

## House styling is load-bearing

The layout scaffolding in these forms — `hideHeading` page cards, header/title bands, stat-card rows, `sectionSeparator`s, `validationErrors` placement, toolbar `buttonGroup`s, filter/quickSearch containers, styled `datatableContext` wrappers — is the house style. Preserve it. Do not strip containers, styles, or structural chrome to "simplify" a cloned form; a new form should be visually indistinguishable in structure from its archetype.

These are internal assets: markup is stored as-is from the source app and must not be modified in place.
