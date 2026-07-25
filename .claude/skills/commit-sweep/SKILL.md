---
name: commit-sweep
description: Report-only cross-commit, cross-repo regression sweep over a window of `main` commits in BOTH Orbit repos. Reads the last N commits (default 10) or `--since <when>` on each repo and diff-reviews them together, hunting the gotchas a per-PR review structurally cannot see because each PR merged in isolation (migration DDL dupes, dropped RN pins, analyzer-silent-locally violations, cross-repo contract drift, parity/i18n drift, stale-artifact QA hazards). Emits one severity-ranked report to `.claude/audits/commit-sweep.md` plus a `.status` sidecar. Runs nightly via `.github/workflows/commit-sweep.yml` and on demand as `/commit-sweep`. Not for a single diff (use /pr-review); not for a whole-repo audit (use /audit-*).
argument-hint: >-
  <N=10 | --since <when>> <repo-scope: both|ui|api>
---

# Commit Sweep

**Input**: $ARGUMENTS

Read a window of recent `main` commits across BOTH Orbit repos and diff-review them
**together**, looking for cross-commit and cross-repo regressions that a per-PR `/pr-review`
never sees: each PR merged in isolation, so a migration that duplicates an index an earlier
migration already created, or an orbit-api DTO rename whose paired Zod change never landed,
only becomes visible when the whole window is read in one reasoning context. This is the
cross-session backstop for the gotchas the deterministic gates and the per-diff review
structurally miss.

**Golden rule**: no vibes. Every finding names the `file:line`, the commit sha, and the exact
prior evidence (the earlier migration that already made the object, the removed pin's hunk, the
missing mirror path). An unproven claim is dropped. This single-pass skill has no adversarial
skeptic, so the evidence bar is the discipline that keeps it honest.

---

## Phase 0 - Provenance & self-containment

**Report-only.** This skill reads local `git` history on both checkouts and writes exactly two
files: the report and its `.status` sidecar. It never remediates, refactors, edits code, or posts
to GitHub - the human (or a later task) fixes, and the workflow's own `run:` steps do the label +
issue upsert, which keeps the tool surface minimal and the logic portable. Same hard line the
`/audit-*` skills hold.

**Self-contained.** It uses only local `git` (`git -C "<root>" ...`) and file reads. No network,
no suite run, no build. It runs identically locally (`/commit-sweep`) and on the ubuntu CI runner
(`.github/workflows/commit-sweep.yml`).

**The rubric is a calibrated seed, not a ceiling.** The six checks below were distilled from real
Orbit prod/build incidents, cited by their memory keys as the single allowed WHY-with-reference
(the same way the audit skills cite claudeskills.info). Surface any cross-commit regression
outside the six named classes too - the incidents are the calibration, never an allow-list that
blinds the sweep to a novel gotcha.

---

## Phase 1 - Resolve roots + parse args

Resolve each repo root from an env var, defaulting to the local Windows absolute so behavior is
identical locally (env unset) and in CI (env set by the workflow):

- `UI_ROOT`  = `$ORBIT_UI_ROOT`  or `C:\Users\thoma\Documents\Programming\Projects\orbit-ui-mobile`
- `API_ROOT` = `$ORBIT_API_ROOT` or `C:\Users\thoma\Documents\Programming\Projects\orbit-api`

Parse `$ARGUMENTS` into a window mode and a scope:

- **Count mode (default, manual).** A numeric first token is the commit count `N` (default `10`).
  `git -C "<root>" log -n N ...`.
- **Time mode (scheduled).** `--since <when>` (any git approxidate, e.g. the workflow's
  `--since "24 hours ago"`). `git -C "<root>" log --since=<when> ...`. Time mode can yield an
  EMPTY window (no commits) - that is a first-class outcome, not an error.
- **Scope** (optional trailing token, reusing the audit vocabulary): `both` (default);
  `ui`/`web`/`mobile` -> orbit-ui-mobile only; `api`/`backend` -> orbit-api only. A non-numeric,
  non-`--since` first token is treated as the scope with `N` defaulting to 10.

Print the resolved `{mode, N-or-since, scope, UI_ROOT, API_ROOT}` before gathering.

---

## Phase 2 - Gather the window (both modes)

For each in-scope repo:

```bash
# count mode
git -C "<root>" log -n <N> --format='%h %ad %s' --date=short
# time mode
git -C "<root>" log --since=<when> --format='%h %ad %s' --date=short
```

Then, per commit in the window, read the change:

```bash
git -C "<root>" show <sha> --stat
git -C "<root>" show <sha>            # the full patch
```

Plus the aggregate subsystem diff over the window, restricted to the paths the rubric cares about
(migrations, lockfiles/pins, shared types, endpoints, i18n tables, the two app trees):

```bash
git -C "<root>" diff <oldest-sha>^..<newest-sha> -- <rubric paths>
```

Record each repo's window span (first date .. last date) so Phase 4 can flag time-skew. **If both
windows are empty** (time mode, no commits), skip straight to Phase 4 with the `empty` outcome.

---

## Phase 3 - Apply the six-check rubric holistically

Read the combined window as ONE context and apply every check below. Each real issue becomes a
finding in the shared audit template:

> `severity · title · category (the rubric check it maps to) · location (repo-relative path:line
> + commit sha) · evidence (the exact diff hunk / prior-migration line) · rationale (the incident
> class) · fix (concrete) · reference (the memory key / CLAUDE.md rule)`

Rank most-severe first via the Critical / High / Medium / Low ladder.

### 1. Migration DDL duplication -> Postgres 42P07 on redeploy (Critical)

- **Where**: orbit-api commits touching any `*Migrations*` path.
- **Pattern**: a windowed migration creates an index/constraint - either a structured builder call
  (`migrationBuilder.CreateIndex`, `.AddUniqueConstraint`, `.AddColumn`) OR raw
  `migrationBuilder.Sql("... CREATE [UNIQUE] INDEX / ADD CONSTRAINT ...")` - whose object name
  already exists in ANY prior migration in the FULL history, and the new DDL is bare (not
  `CREATE INDEX IF NOT EXISTS`, not otherwise guarded). Scan BOTH DDL forms; a grep that only
  matches `.CreateIndex(` misses the exact class that caused the #338 crash (a bare raw-SQL
  `CREATE UNIQUE INDEX` duplicating one an earlier raw-SQL migration already made).
- **Full-history grep** (robust to the historically-split migration folders):
  `git -C "<API_ROOT>" grep -nE 'CREATE (UNIQUE )?INDEX|ADD CONSTRAINT|\.CreateIndex\(|\.AddUniqueConstraint\(|migrationBuilder\.Sql' -- '*Migrations*'`
- **Evidence**: the windowed migration `file:line` + the prior migration `file:line` that already
  created the object.
- **Rationale**: EF applies migrations at Render startup; a duplicate DDL throws `42P07`, the
  deploy fails, and prod stays STALE. The unit suite (no real DB) never catches it. This is the
  highest severity - it breaks every deploy silently past CI.
- **Reference**: `project_orbit_api_deploy_migration_pitfall`.

### 2. npm dropping react-native transitive deps / Expo-pin generic bump -> broken release build (Critical/High)

- **Where**: orbit-ui-mobile commits touching root `package.json` (`overrides`), `.npmrc`,
  `apps/mobile/package.json`, `apps/mobile/scripts/fix-hoisting.js`, or `package-lock.json`.
- **Pattern**: removal of any load-bearing explicit pin from `apps/mobile/package.json`
  (`hermes-compiler`, `memoize-one`, `promise`, `regenerator-runtime`); a lockfile reconcile that
  drops those install nodes; removal of the `react-native` root-junction logic in
  `fix-hoisting.js`; or a generic bump of an Expo-SDK-pinned package outside Expo's own tooling.
- **Evidence**: the diff hunk removing the pin/junction or bumping the pinned package.
- **Rationale**: npm silently drops several of RN's transitive deps under this repo's `overrides`
  + `legacy-peer-deps`; the release build then dies at Gradle config / Metro bundling. It "works"
  until a reconcile prunes a stale `node_modules`.
- **Reference**: `project_npm_drops_rn_transitive_deps`, `project_worklets_version_pin`,
  `project_dependency_update_automation`.

### 3. ORBIT0002 redundant EF rollback + ORBIT0001 narration comment (analyzer-silent-locally class) (High)

- **Where**: orbit-api commits.
- **Pattern**: an explicit `RollbackAsync()` / `Rollback()` on a `using`/`await using`-scoped
  `IDbContextTransaction` (the correct catch is `ChangeTracker.Clear(); throw;` - scope disposal
  already rolls back); OR a bare narration `//` comment (not `///` XML-doc, not a URL-linked WHY,
  not a tooling directive).
- **Evidence**: the `catch` block / comment `file:line` + commit sha.
- **Rationale**: both analyzers are SILENT in the local build (the in-box csc is older than the
  analyzer's Roslyn, `CS9057`) and only fail in CI, so a violation lands clean locally and blows
  up a later run - precisely a cross-commit trap.
- **Reference**: orbit-api/CLAUDE.md (ORBIT0001/0002), `project_orbit_analyzers_local_silent`.

### 4. Cross-repo contract drift + append-only / deploy-API-first violation across the window (High)

- **Where**: paired commits across BOTH repos in the window.
- **Pattern**: an orbit-api commit renames/removes/retypes a DTO field or changes an endpoint, but
  no paired orbit-ui-mobile commit updates `packages/shared/src/types/*` (Zod),
  `packages/shared/src/api/endpoints.ts`, or the callsites (or vice versa); OR a shared/DTO change
  that is NOT append-only (renames/removes/retypes a field old mobile clients still read) without
  the `AppConfig.MinSupportedVersion` expand-contract gate.
- **Evidence**: the API-side change `file:line` + sha and the ABSENCE of the mirror change in the
  sibling window.
- **Rationale**: the two PRs merge separately, so a single-diff `/pr-review` on either never sees
  the mismatch. Mobile lags via the Play store, so a non-append-only change breaks live clients.
- **Reference**: root CLAUDE.md "Security & contracts", orbit-api/CLAUDE.md "Cross-repo parity
  contract", #210 / #206.

### 5. Cross-platform parity drift + i18n key asymmetry across the window (Medium/High)

- **Where**: orbit-ui-mobile commits touching `apps/web/**`, `apps/mobile/**`, or the two i18n
  tables (`packages/shared/src/i18n/en.json`, `pt-BR.json`).
- **Pattern**: a change to `apps/web/**` whose mirror in `apps/mobile/**` (or vice versa) never
  landed anywhere in the window - logic/feature/behavior/error-handling drift beyond the allowed
  platform-adapter differences; OR an i18n key added to `en.json` without `pt-BR.json` (or vice
  versa).
- **Evidence**: the changed `file:line` + sha and the missing mirror path.
- **Rationale**: the Cross-Platform Parity job in `guards.yml` only asserts that a PR touches both
  trees, and `parity:exempt` skips it entirely - so behavioural drift, or web in one PR and mobile
  "later", passes it. The sweep is the cross-session backstop.
- **Reference**: root CLAUDE.md "Cross-platform parity (MANDATORY)",
  `feedback_cross_platform_parity_reflex`.

### 6. Stale-artifact / regenerate-required QA hazard (Low / Info - verification caveat)

- **Where**: any commit whose change is only correct after a rebuild/regenerate a later human QA
  might skip.
- **Pattern**: a visual/layout fix in `apps/web` (QA must be a dev-server restart on cleared
  `.next` + hard-refresh, never a long-lived tab); a native/`apps/mobile` change needing a fresh
  APK; a change to a widget-fed data shape (the cache-first Android widget); or any committed
  derived artifact that drifted from its source.
- **Evidence**: the commit + the artifact/source that must be regenerated.
- **Rationale**: SPA navigation and stale `node_modules`/caches make a human QA a pre-fix bundle
  and mis-report a fixed bug as broken. This is a "verify against a fresh build" caveat, not a
  code defect - surfaced so the reviewer does not QA stale output.
- **Reference**: `project_dev_qa_stale_bundle_hard_refresh`,
  `project_android_widget_app_fed_cache_first`.

---

## Phase 4 - Synthesize the ranked report + status sidecar

```bash
mkdir -p "<UI_ROOT>/.claude/audits"
```

Write **`<UI_ROOT>/.claude/audits/commit-sweep.md`** with this structure, findings ranked
most-severe first:

```markdown
# Commit Sweep - {count-mode: last N commits | time-mode: commits since {when}} (both repos)

**Window**: orbit-ui-mobile {sha..sha} ({N} commits, {date}..{date}) - orbit-api {sha..sha} ({N} commits, {date}..{date})
**Verdict**: {1 line - e.g. "Clean", "No new commits in window" (empty), or "1 Critical: migration dup will 42P07 on next deploy"}

## Findings
### Critical
{audit-template findings, or "None"}
### High
{... or "None"}
### Medium
{... or "None"}
### Low / Info (verification caveats)
{... or "None"}

## Cross-repo pairing
{Which windowed changes needed a sibling-repo change and whether it landed - the check-4/5 ledger. Note where a sibling change may predate or postdate this window.}

## Coverage
| Repo | Commits reviewed | Window span |
|---|---|---|
| orbit-ui-mobile | {N} | {date..date} |
| orbit-api | {N} | {date..date} |
{Flag here if the two windows are badly time-skewed - a pairing check may span the boundary.}

## What's clean
{Genuinely-safe classes in this window - not filler.}
```

Then write the machine-readable sidecar **`<UI_ROOT>/.claude/audits/commit-sweep.status`** = exactly
one word (the workflow's surfacing step branches on this token, never on grepping the markdown):

- `empty`    - time mode, no commits in the window
- `clean`    - commits reviewed, no findings
- `findings` - at least one finding

A clean window earns a `clean` status and a short "What's clean" note - never a pad of invented
Low nits.

---

## Output

```markdown
## Sweep Complete

**Window**: {count: last N commits | time: since {when}} · scope {both|ui|api}
**Status**: {empty | clean | findings}
**Verdict**: {1 line}

| Severity | Count |
|---|---|
| Critical | {N} |
| High | {N} |
| Medium | {N} |
| Low / Info | {N} |

**Report**: `.claude/audits/commit-sweep.md`
**Top finding**: {the single most severe finding, or "none - window clean"}
```
