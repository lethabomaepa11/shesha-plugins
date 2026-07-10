# Modern-renderer gotchas (0.45-class / versioned backends)

Mechanics reverse-engineered against a live 0.45-class renderer. Read before building or debugging a form on any backend whose components carry integer `version`s. Each of these cost ~an hour to derive once — don't re-derive them.

---

## 1. Components need a `version` or they render READ-ONLY

A component with **no integer `version`** falls back to a legacy render path that draws standalone create/edit fields as **read-only display spans, not inputs**. Symptom: *"fields show as labels/spans; only the checkbox is interactive"*. It is NOT an `editMode` problem — the same markup with versions stamped renders live inputs.

**Fix:** every component carries its current `version`. Resolve it from [component-cheatsheet.md](component-cheatsheet.md) / the source-derived component KB (`assets/components-kb/`), or copy it from a **LIVE form on this backend that HAS versions** — e.g. an existing login form. **NEVER model a new form on a versionless legacy seed** — you inherit its missing versions and the whole form goes read-only.

**The frontend `@shesha-io/reactjs` package.json version can MISLEAD.** One backend's package.json reported `0.35.0` while the shipped renderer was 0.45-class (required per-component versions). Trust **live-form shapes and the component KB**, not the package.json string.

---

## 2. Conditional visibility = code-mode `hidden`, NOT `customVisibility`

On the modern/versioned renderer, legacy `customVisibility` ("return true to show") is **IGNORED**. Use code-mode `hidden`, which returns **TRUE to hide**:

```json
"hidden": {
  "_mode": "code",
  "_code": "return !(data?.attendingDinner)"
}
```

- Use `data?.field` **optional chaining** — create forms have no `data` context initially, and a throw fails-open (the field stays visible), masking the bug.
- Verified: the compiled `reactjs` bundle maps `customVisibility` → `hidden` through this same code-mode mechanism, so authoring `hidden` directly is the reliable path.

---

## 3. Anonymous public-form writes

Dynamic-CRUD create is permission-protected — an anonymous POST returns **401**, and dynamic-CRUD endpoints are NOT cleanly configurable as anonymous permissioned objects. For a public self-registration form:

1. Set form `access: 5` (anonymous) — this auto-registers an anonymous permissioned object for the **form** and its reflist fetch.
2. Scaffold a custom `[AbpAllowAnonymous]` app service via `shesha-developer:shesha-app-layer` that creates the entity, **forces server-side values** (e.g. `Status`), and re-enforces the conditional rules server-side.
3. Wire the form Submit to POST to that endpoint via an **ExecuteScript** action (field-level `validate` still gives inline feedback; the server is the backstop), then **Navigate** to the thank-you form.

**NEVER expose raw entity CRUD to the anonymous internet.**

---

## 4. Backend-bootstrap playbook (entity / reflist / endpoint all missing)

**PLAN all backend changes up front** — entity + migration (with `Lkp` reflist columns, see `shesha-developer:domain-model`) + custom app service — and apply them in **ONE build + double-boot**, not a serial discover→build→discover→build loop (one run wasted 5+ rebuild/restart cycles doing this).

Boot lag:
- A **NEW entity needs TWO boots** — its dynamic CRUD controller registers on the boot *after* its `EntityConfig` is seeded.
- Reflist items + app-service code need **ONE boot**.

**Verify entity CRUD Create returns 200 BEFORE authoring the form.** Restart mechanics (headless `dotnet` takeover of :21021, never relaunch IIS Express): see [backend-restart.md](backend-restart.md).
