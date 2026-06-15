# Capability levels — routing detail

SKILL.md Step R gives the summary table. This file holds the signals, the per-level step matrix, escalation triggers, and the L4/L5 orchestration recipe.

---

## Signal phrases → level

| Level | Typical request shapes |
|---|---|
| **L1** | "add a field/column/button to X", "make Y required/read-only/hidden", "fix this script", "wire this button", "change the label/placeholder/tooltip", "add a delete action to the rows" |
| **L2** | "create a table/list view for X", "create a create/details/dialog form", "build a page that captures…", "convert sections to tabs", "a search form that calls…", "on a new form, add…" |
| **L3** | Anything where a prerequisite may not exist: "build a working X page **end-to-end**", "**including whatever is needed** to back it", "create everything required", the entity/property/reflist is new, or "add it to the navigation" |
| **L4** | "all the screens to manage X", "list, create, details — fully linked", "dashboard with drill-downs", 2+ linked pages in one request |
| **L5** | "build me an app/system that…", a paragraph-to-spec-length brief, an attached document or mockup image covering multiple entities and flows |

Type dimension: **Update** = the form exists (resolve by module+name or by scanning the module's form list); **Create** = a new form (naming default `{entity-kebab}-{type}` in the task-context module).

---

## Step matrix

| Step | L1 | L2 | L3 | L4/L5 |
|---|---|---|---|---|
| R route | ✔ | ✔ | ✔ | ✔ |
| 0 design ask | skip | interactive only | interactive only | interactive only (plan checkpoint instead) |
| 1–2 URL + auth | ✔ | ✔ | ✔ | once, by the orchestrating context |
| 3 identify form | ✔ | ✔ | ✔ | per form, from the build plan |
| 4 fetch markup | ✔ (update) | ✔ (update) | ✔ | per form |
| 4.5 entity check | inline (cached ok) | inline | **prereq-checker agent gate** | prereq-checker gate once per entity wave |
| 5 apply | inline | seed-first | seed-first, forms LAST | form-author agents (distinct forms) / fleet-transformer (mechanical) |
| 5.5/6 validate | ✔ | ✔ + form-quality | ✔ + form-quality | + auditor fan-out before push |
| 7–8 push/verify | ✔ | ✔ | ✔ | per form + cross-link pass |
| 8.5/9 smoke | only if visual/behavioral | ✔ | ✔ + end-to-end data round-trip | key paths (table→details→dialog) |
| 9.5 aesthetic | skip | ask (interactive) | ask | skip |
| 10 confirm | ✔ | ✔ | ✔ | ✔ + form inventory |

---

## Escalation / de-escalation triggers (each names its check)

- **L1/L2 → L3**: Step 4.5 metadata 404/empty; reflist unresolvable; `Crud/GetAll` probe 400/500; the request mentions navigation/menu and the menu item doesn't exist.
- **L2 → L4**: the user asks for a 2nd/3rd linked form mid-task; the Add/navigate target form doesn't exist and must be built (not just referenced).
- **L3 → L4**: the "one page" turns out to need siblings (a details page for the table's drill-down, a create dialog…).
- **De-escalate**: "actually just the one form" → drop to L2; an entity assumed missing turns out registered → back to L2 path.
- Escalation is triggered by a CONCRETE failed check, never by vibes. Default DOWN when ambiguous.

---

## L3 — full-stack single page

1. Run the prereq gate (`fullstack-prereq-checker` agent, or inline curls for a single entity) BEFORE any form JSON.
2. Fix gaps via the owning skill: entity/property/reflist/migration → `shesha-developer:domain-model`; custom endpoint → `shesha-developer:shesha-app-layer`; then RE-VERIFY (metadata non-empty, `Crud/GetAll` 200).
3. Build forms (L2 path, seed-first). Forms come LAST — never push a form bound to an unverified entity.
4. "Add it to the navigation" → [navigation-menu.md](navigation-menu.md).
5. End-to-end verification: create a record through the UI (or API), see it in the table, open its details.

## L4 — multi-page builds

1. **Plan first**: list every form (name, type, entity, links). Interactive: confirm the plan with the user; headless: state it, then proceed.
2. Prereq gate once per entity.
3. **Build order: create-forms → details → table forms** — tables reference the other two by `formId`, so dependencies resolve naturally. Track names in a registry (`.claude/cache/shesha-form-edit/forms-registry.json`) so links never drift.
4. Distinct forms → parallel `form-author` agents ([orchestration.md](orchestration.md)); audit fan-out; push centrally.
5. **Cross-link integrity pass (mandatory)**: every `formId` reference and navigate target in every built form resolves via `GetByName`.
6. Browser-smoke the key path: table → Add dialog → submit → row appears → drill-down to details.

## L5 — application from a brief

1. Decompose the spec: entities (+relationships), reflists, roles/permissions, pages per entity (table/create/details), dashboards, flows, navigation.
2. **Checkpoint the plan** (interactive: user approval; headless: emit the plan, then execute).
3. Execute as waves of L3/L4: entity wave (domain-model per entity cluster) → prereq verification → per-entity L4 form sets → dashboards/flows → navigation wave → final cross-link + smoke pass.
4. Inventory at the end: every entity, form, menu item created (module + name + id).

---

## Cost discipline

- L1/L2 pay for: one context, the topic files actually read, one push, an optional smoke. No agents, no design passes (unless asked), no fleet reads.
- The router exists to keep that floor low — escalation must be EARNED by a failed check.
- L4/L5: tell the user the shape of the cost (N forms × author+audit, backend builds) before starting when interactive.

## Rationalizations (refuse these)

| Excuse | Reality |
|---|---|
| "These 3 linked forms are simple, I'll do them inline" | 3+ linked forms = L4. Context degradation on form 3 is the documented failure mode. |
| "I know the C# pattern, I'll create the entity inline" | The domain-model skill owns entities/migrations. The gate is the invocation, not your confidence. |
| "Push returned 200, we're done" | UpdateMarkup returns void. Re-fetch + diff is the only proof ([verification.md](verification.md)). |
| "It's a tiny edit, skip clean-form-config" | Step 6 is unconditional. Tiny edits broke forms in production. |
| "The reflist name is probably the property name" | It frequently isn't. Resolve from metadata `referenceListName` — every time. |
