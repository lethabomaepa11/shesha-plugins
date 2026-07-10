# Pre-flight — one-time session setup (run once, before Step 1)

A design build fans out into many sub-skill invocations (comprehend × N screens, `shesha-form-edit` × N screens, style × N, verify × N). Establishing six things **once** keeps every downstream call cheap and consistent — most of the waste in a design run is the same setup work (auth, path guessing, metadata fetch, skill-root hunt) repeated per screen. Do this before ingesting the design.

## 1. Pin one shell + define the session workdir

- **Pin ONE interpreter for the whole run** and use only it. Alternating bash/PowerShell mid-run is the single biggest source of wasted round trips — a PowerShell-ism (`New-Item`, `Out-Null`, `ConvertFrom-Json`) run inside bash fails, and vice-versa. On Windows use **PowerShell**; on Linux/macOS/WSL use **bash**. Record the choice and never switch.
- Define a single session scratch dir `<workdir>` and create it once. Everything transient lives under it — blueprints, layout probes, temp request bodies, the cached token, the run log. This is the `<workdir>` referenced throughout this skill and the handoff contract.
  - PowerShell: `$WORKDIR = "$env:TEMP/shesha-designer/<app-slug>"; New-Item -ItemType Directory -Force $WORKDIR | Out-Null`
  - bash: `WORKDIR="${TMPDIR:-/tmp}/shesha-designer/<app-slug>"; mkdir -p "$WORKDIR"`
- Always write paths with **forward slashes** and **quote** them (PowerShell accepts forward slashes). Never hand-type a backslash-style Windows path into a command — unescaped backslashes get mangled.
- **Do not depend on `jq`** — it is absent on a default Windows box (exit 127). Parse JSON with `node -e` or the pinned shell's native support (`ConvertFrom-Json` in PowerShell).

## 2. Authenticate once → cache the token

- Authenticate a **single time** (default `admin`/`123qwe`, or the supplied context credentials) and write the access token to `<workdir>/access-token`.
- Every subsequent API call — in this skill, in every `shesha-form-edit` invocation, and in the playwright smoke — reads the token back from that file (`$(cat "$WORKDIR/access-token")` / `(Get-Content "$WORKDIR/access-token")`). **NEVER paste the ~600-char JWT literally into a command** — it echoes back into context on every result and dominates the token cost of an auth-heavy run.
- Pass `<workdir>` (which locates the token file) to each sub-skill in its Contract so it **reuses** the cached token instead of re-authenticating per screen. Re-authenticate only on a `401` or after the 24 h TTL.

## 3. Resolve the skill root once

- Resolve the installed plugin skill root **once** (e.g. `.claude/plugins/cache/<marketplace>/shesha-developer/<version>/skills`) and record the absolute path. Reference sub-skill seeds/assets/scripts (`shesha-form-edit/assets/blocks`, `assets/examples`, `scripts/summarize.js`) by that recorded root. Don't `find`/`ls`/`Glob`-hunt for the cache path on each use.

## 4. Fetch scoped entity metadata once → cache

- For each entity a screen binds to, fetch metadata **once** via the scoped `GetProperties` endpoint (`shesha-form-edit` Step 4.5), distill to a `<entity>.summary.md`, and reuse the summary across every screen that binds the same entity.
- Never fetch a full `GetAll`/full-metadata dump when a specific entity + field set is all you need, and **never read a raw metadata dump inline** — pipe it to a file and read only the distilled summary (a raw `Metadata` response can exceed the 25k-token Read limit and force a retry).

## 5. Consolidate confirmation + pre-authorize routine work

- Gate on **one** consolidated confirmation: present plan + blueprints + cost estimate together (Step 3) and get a single go-ahead for the whole build — not a prompt per screen or per push.
- Hand the sub-skills a context block / flags (`--no-design`, the headless context block from the handoff contract) so they treat routine pushes as pre-authorized and don't re-prompt mid-build. A run that dies on repeated confirmation rejections has already spent the cost.

## 6. Keep a cost ledger (so the next pass is measured, not inferred)

- Append a one-line note per phase to `<workdir>/run-log.md`: the phase, elapsed time, and the session cost figure the harness reports at that point. Efficiency reviews of this skill currently have to *infer* cost from round-trip patterns because no run records it — this ledger is the only in-skill signal that makes the next pass measured.

## Within-session dedup

- A reference doc read once stays in context — do **not** re-read a sub-skill reference (e.g. `shesha-form-edit/references/form-quality.md`, `component-cheatsheet.md`, `examples.md`) that this run already loaded.
