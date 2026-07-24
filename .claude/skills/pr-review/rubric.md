# Orbit Review Rubric

The single source of truth for what a review checks, shared verbatim by two skills:
`/pr-review` walks it dimension-by-dimension over a **diff**, and `/audit-code-quality`
(#228) walks it over the **whole repo**. Both read this one file
(`.claude/skills/pr-review/rubric.md`) — there is no second copy, so the two can never
drift. It is command-agnostic on purpose: it contains **dimensions, severities, and
templates** — no orchestration, no scope resolution, no GitHub mechanics. Those live in
the consuming skill.

Every finding cites the rule it came from (a `CLAUDE.md` rule number, `no-comments.cjs`,
a `DESIGN.md` section, an orbit-api hard rule, or a security category) so the author can
trace it back. Cite sections, never line numbers: line numbers rot silently and then point
a reviewer at the wrong rule. Tag every finding with a severity from the ladder at the
bottom.

> **Machine-read.** `.claude/workflows/audit.mjs` passes this file's path to every
> code-quality finder as "the contract for what counts and how findings are shaped"
> (`KIND['code-quality'].checklist`), which is why it stays orchestration-free: an edit here
> changes the finder prompt as well as the review.

---

## Severity ladder

One vocabulary for every dimension. A finding's severity is about blast radius, not
which dimension raised it.

| Severity | Meaning | Action |
|---|---|---|
| **Critical** | Exploitable, data loss, crash, broken contract, or **breaks an already-shipped client**. | Block merge. Fix now. |
| **High** | Type-safety hole, missing error handling, missing parity, missing validation, dead code that ships. | Fix before merge. |
| **Medium** | Pattern inconsistency, missing edge case, missing test, defense-in-depth gap. | Fix soon; OK to merge with a tracked follow-up. |
| **Low** | Style deviation, minor naming, micro-cleanup. | Address when convenient. |
| **Info** | Observation, forward-compatible note, praise. | No action required. |

### The `⚠️ breaks old mobile clients` marker

A **Critical-class** marker, separate from the severity word, applied to any finding
where a `packages/shared` Zod schema or an orbit-api DTO change makes an
already-installed Android client misbehave. Old Android builds ship a **frozen
`@orbit/shared` snapshot** — a server-side or shared rename is invisible to them; they
keep using the old field name and silently break. Detection and classification are
defined in the **Contract drift + backward-compat guard** dimension below. Any finding
carrying this marker is Critical regardless of how small the diff looks.

---

## Signal gate — post high-signal only

The review CONVERGES; it is not a nit machine. What gets posted is gated by severity:

- **Critical / High** — always post; these decide the outcome.
- **Medium** — post only when concretely actionable (a specific missing test, a real unhandled edge case, a definite pattern break). Never speculative.
- **Low / Info** — do **not** post as PR-review findings. A local deep audit may list them; on a PR they are noise.

**Never post — not findings, in any dimension:** style preferences (verbose vs concise, arrow vs named function, optional-chaining vs guard); naming bikeshed; reformatting; "consider extracting / hoisting / future-proofing" on code that already works; Zod modifier ordering (`.nullable().optional()`) when behavior is correct; magic-number→const when the value is obvious from context; anything the author chose defensibly that you would merely prefer otherwise; anything already addressed in an earlier commit or a resolved review thread.

**Outcome is deterministic:** `NEEDS WORK` iff ≥1 surviving **Critical or High** finding (including any `⚠️ breaks old mobile clients`); otherwise `APPROVE`. Medium / Low / Info never force NEEDS WORK. Never manufacture a Critical/High finding to avoid approving — a clean diff earns a plain approval.

---

## Finding template

Every finding, every dimension, the same shape:

```
[SEVERITY] <one-line title>  ⚠️ breaks old mobile clients (only if applicable)
· dimension: <rubric dimension>
· location: <repo>/<path>:<line>
· issue: <1-2 sentences — what is wrong>
· risk: <1-2 sentences — what goes wrong if it ships>
· fix: <the concrete change, or a corrected snippet>
· reference: <CLAUDE.md rule N | no-comments.cjs | DESIGN.md:181 | orbit-api hard rule | OWASP | security category>
```

---

## Dimensions

Each dimension is a checklist. A diff that doesn't touch a dimension's surface skips it
(noted as N/A) — do not invent findings for files the diff never changes. UI dimensions
are **gated to `apps/*` changes**; backend hard rules are gated to `orbit-api` changes.

### 1. Correctness

> Reference: the change's own intent (PR body / linked issue / plan).

- Does it do what the PR/issue says, across every boundary it crosses?
- Data flow: request shape in → handler → response shape out → consumer reads it. Any
  mismatch in that chain?
- Boundary conditions: empty list, zero, null, first/last item, timezone edges (dates
  must route through `IUserDateService` on the backend — see dimension 13).
- State: are loading / error / empty states all handled, not just the happy path?
- Concurrency / ordering assumptions that the diff silently relies on.

### 2. Dead / stale code

> Reference: CLAUDE.md rule 2; orbit-api "No dead code".

- Orphaned exports, functions, or types with **zero references** after this change
  (cite the zero-reference grep).
- Dead branches that can no longer be reached.
- Commented-out code blocks.
- Stub functions and speculative "just in case" parameters.
- Imports / variables the diff itself left unused.

### 3. SOLID / clean architecture

> Reference: CLAUDE.md rules 6, 7, 10.

- Function size soft cap ~50 lines, nesting ~3 levels; hard cap ~100. Over → the
  function is doing too much, split it (rule 7).
- New endpoints follow CQRS (Command/Query + Handler + Validator) on the backend.
- Frontend respects the adapter split: Server Action (web) vs `apiClient` (mobile);
  shared logic in `packages/shared`, not duplicated per app.
- No premature abstraction — extract on the third real use, not the second (rule 6).
  Three similar lines beat a helper invented for two.
- DRY at the right level (rule 10): cross-app → `packages/shared`; cross-component →
  `apps/<platform>/components/`; cross-function-in-file → a local helper. Don't lift to
  `shared` for one caller.

### 4. Comment policy

> Reference: `eslint-rules/no-comments.cjs:17-24` (local/no-comments); orbit-api `ORBIT0001`.

The reviewer flags a comment exactly when the linter would. **Allowed**, nothing else:

- `/** … */` JSDoc block (a `Block` comment whose value starts with `*`) on an exported
  function, hook, or type — one short paragraph on intent and contract.
- A `///` line (a `Line` comment whose trimmed value starts with `/`) — TS triple-slash
  reference / C# XML doc.
- A tooling directive matching `no-comments.cjs`'s `DIRECTIVE` set: `eslint-disable*`,
  `@ts-*`, `ts-*`, `prettier-ignore`, `@jsx`, coverage/bundler pragmas
  (`c8`/`v8`/`istanbul`/`webpack`/`@vite`/`@vitest`/`@__PURE__`).
- A WHY note that contains an `http(s)://` URL to an upstream issue/PR/doc — a real
  external constraint the author cannot fix here.

Everything else is a finding: `//` narration, restating code, task/PR/fix references,
TODOs. The fix is never "reword the comment" — it is **rename the symbol or extract a
well-named function** so the code reads without prose.

### 5. No-workaround / root-cause

> Reference: CLAUDE.md rule 1; orbit-api "No workarounds".

- The signature smell: **ugly frontend written to dodge a missing or awkward API** —
  client-side reshaping, refetch-and-merge, optimistic patches that paper over a shape
  the backend should return directly. Flag it and point at the upstream fix.
- Fallbacks, defensive branches, or local patches for a problem that belongs to a
  config, a type, or a shared util.
- An unavoidable workaround is allowed **only** with a one-line WHY-with-URL note
  (dimension 4). No link → it is not a sanctioned workaround.

### 6. Type safety

> Reference: CLAUDE.md rule 3.

- TypeScript: any `any`, `as any`, or `as unknown as X` escape hatch. Use `unknown`
  with narrowing instead.
- C#: implicit conversions and unjustified `null!` (the C# analog of an `as any`).
- Inferred-`any` callbacks and untyped external payloads crossing a trust boundary
  without a Zod parse.

### 7. No `console.log`

> Reference: CLAUDE.md rule 4.

- Any `console.log` (or stray `print`/`Debug.WriteLine`) in production code. Use the
  project logger or remove it. Test files are exempt.

### 8. DESIGN.md / AI-slop

> Reference: `DESIGN.md` sections **Identity & anchor**, **Bans**, **AI-slop test**, and
> **Scene-sentence test**. **Gated: only when the diff touches `apps/*` UI files.**

The anchor is the **de-decorated navy-violet orbital** (#539 freeze, 2026-07-17): a
near-black canvas, one rationed violet, opaque-reading surface steps, hairline rings and
dividers. Identity is carried by the orbital logo mark, the Astra glyph, and ring-shaped
status and progress indicators, and by nothing else. Hierarchy is bought with surface steps,
hairlines, size, weight, and whitespace. **Quiet decoration is still decoration**: a softened
glow, a 0.03-opacity texture, a "subtle" mesh are the same violation as the loud version.

Scan for the AI-slop tells:

- **Any decorative glow.** The primary-glow shadow token is deleted, so a glow reaching this
  diff is hand-rolled. Not on the CTA, not on the FAB, not anywhere.
- **Any decorative gradient.** `--gradient-header` and `GradientTop` are deleted; there is no
  sanctioned gradient left to be outside of. No wash, no gradient border, no gradient text
  (`bg-clip-text` over a gradient), no mesh, bloom, scanlines, or "subtle texture".
- **Decorative background orbit arcs**, deleted with the rest of the decoration layer.
- A coloured side-stripe: a `border-left` / `border-right` thicker than 1px used as an accent
  stripe on a card, row, callout, or alert.
- Cards-in-cards (opaque card-on-card on dark), or a card where spacing would have grouped.
- Connector or tree lines in a hierarchy.
- Gray text on colored backgrounds; rounded-square icon tiles above headings.
- Semantic-red destructive fills where the artboard shows a text pill.
- Oversized centered H1 outside a hero context.
- The hero-metric template (big number, small label, stat row) used as decoration, or any
  invented precise-looking number.

Accent split and rationing (`DESIGN.md`, **Tokens**):

- `--primary` is **fill and graphic only**: CTA background, FAB, progress ring, done dots,
  level bar, active tab. It is **never** small text on the canvas.
- `--primary-soft` is the **accent-text** token: an accent-coloured word, link, or numeral.
- The accent appears on the active tab, progress and ring indicators, done dots, the primary
  CTA, the FAB, and active nav. That is the whole list. It is never decorative on a card, a
  row, a border, a heading, or an icon that is not communicating state.

Token / ban checks (`DESIGN.md`, **Bans**):

- No raw `--slate-*` references or hardcoded violet rgba: tints come from `--primary-rgb` /
  `tintFromPrimary`.
- No `transition-all` (animate `transform` / `opacity`, named); no `h-screen` (use
  `min-h-dvh`); no new font families, radii, or colors outside the spec.
- No per-component scheme branches — schemes resolve through tokens.
- No off-scale shadow: lifted surfaces read `--shadow-1/2/3` (mobile `shadowsV2`) verbatim
  with the inset hairline lift ring, never a heavier hand-rolled `box-shadow`.

`local/no-decorative-glow` and `local/no-raw-gradient` ship at `warn` in `apps/*` pending the
redesign's cleanup, so the pre-existing violations are known debt, not review findings. A
**newly introduced** glow or raw gradient in this diff is still a Blocker: the tokens are
deleted and the ban is settled. Em dashes are owned outright by the Dash Ban gate; do not
re-flag them here.

Then the **scene-sentence test**: describe the rendered screen in one sentence, as if
narrating a film scene. If it reads like every other SaaS app ("a clean modern dashboard with
cards"), it is generic: flag it to rework until the sentence names Orbit's character, a
near-black neutral canvas, quiet tonal panels separated by hairlines, one violet reserved for
what is done and what is next, and the orbital ring language carrying the identity. If the
only way to make the sentence specific is to describe decoration, the design has failed and
the decoration is not the fix.

### 9. Parity (web ↔ mobile)

> Reference: root CLAUDE.md "Cross-platform parity (MANDATORY)". Engine: `parity-checker`.

- Every changed `apps/web/**` file has its `apps/mobile/**` mirror changed in the same
  PR (and vice-versa), per the mirror map in the `parity-checker` contract.
- The mirror is **behaviorally identical** — same logic, data flow, error handling.
  Only platform adapters may differ (BFF vs direct API, cookie vs SecureStore, shadcn vs
  NativeWind, next-intl vs i18next).
- `MISSING` (no mirror file) is High; `PARTIAL` (mirror exists, not updated) is High
  until proven intentional.

### 10. i18n

> Reference: root CLAUDE.md (add keys to both locales in the same edit). Engine: `i18n-syncer`.

- Every new user-facing string has a key in **both** `packages/shared/src/i18n/en.json`
  AND `pt-BR.json` (`MISSING_PT` / `MISSING_EN` are findings).
- No `ORPHANED` callsite referencing a key that exists in neither locale.
- Brand words (`Orbit`, `Astra`) stay untranslated.
- Keys stay dot-notation hierarchical and alphabetized within their hierarchy.

### 11. Contract drift + backward-compat guard

> Reference: CLAUDE.md "API contract" / orbit-api "Cross-repo parity contract".
> Engine: `contract-aligner` for the field-by-field shape comparison.

First, drift (from `contract-aligner`): `MISSING_DTO`, `MISSING_ZOD`, `FIELD_DRIFT`,
`PATH_DRIFT` between `packages/shared/src/types/*` + `endpoints.ts` and the orbit-api
DTOs + Controller routes.

Then the **backward-compat judgment** drift detection alone does not make — the
direction and the add/remove of each field, because old Android clients run a frozen
`@orbit/shared`:

- **Field removed from / renamed in a *response* DTO or schema** → old clients that read
  it now get `undefined` → **`⚠️ breaks old mobile clients` (Critical)**, unless the
  field was already optional AND unused (cite the grep proving it).
- **Field removed from / renamed in a *request* DTO or schema, or a field made
  newly-required** → old clients still send the old shape → server validation rejects
  it → **`⚠️ breaks old mobile clients` (Critical)**.
- **Field added as optional** → forward-compatible → **Info**, not a break.
- **Enum value removed** → old clients may still send it → flag.

Recommend the compatible alternative in the fix: keep-and-deprecate the old field,
accept both names server-side for a release, or gate behind the min-version gate. When
old-client reach is uncertain, downgrade to **High** with a "verify old-client usage"
note rather than over-claiming Critical.

### 12. Security

> Reference: OWASP + orbit-api hard rules. Engine for API code: `security-reviewer`
> (the frontend categories below are what that agent explicitly does NOT cover).

Review the categories relevant to the change.

**Injection** — raw or string-interpolated SQL / EF queries; XSS via unescaped user
input in JSX or `dangerouslySetInnerHTML`; command injection (`exec()` /
`Process.Start()` with user input); path traversal from unsanitized input in file paths.

**Authentication & authorization** — missing `[Authorize]` on a new API endpoint (the
default is `[Authorize]`; missing both it and `[AllowAnonymous]` is a bug); missing auth
checks on Server Actions / BFF routes; hardcoded credentials, JWT secrets, or API keys;
session config must stay httpOnly + sameSite strict + secure always; CORS must stay
restrictive (no `AllowAnyHeader()` / `AllowAnyMethod()`, never `AllowAnyOrigin()` with
`AllowCredentials()`); the Stripe API key set globally in `Program.cs`, never
per-request.

**Data exposure** — sensitive data (passwords, tokens, PII) in `console.log` or
`ILogger`; responses leaking stack traces or DB schema; secrets in source / config;
missing input validation at the API boundary; webhook handlers must verify signatures
(Stripe `WebhookSecret`).

**Dependency & configuration** — known-vulnerable dependency versions; debug mode
enabled in production config; `SecurityHeadersMiddleware` (nosniff, DENY,
referrer-policy, XSS) must not be disabled; request size limits (Kestrel 10MB global,
chat endpoint 20MB) intact.

**Cryptography** — weak hashing (MD5 / SHA1 for passwords — BCrypt is the standard);
hardcoded encryption keys; insecure RNG for security-sensitive values; HTTPS enforcement
intact.

**Error handling** — verbose error messages exposing internals; unhandled promise
rejections / unobserved tasks; catch blocks that swallow errors silently; `Result<T>`
propagated correctly (`PropagateError<T>()` / `ToPayGateAwareResult()` per
`orbit-api/CLAUDE.md`).

**Validation (Orbit-specific)** — the backend is the source of truth; frontend Zod is
convenience only. Every new endpoint needs FluentValidation **and** a domain-entity
guard in the factory/update method. Numeric bounds, date ranges, and mutually exclusive
options are enforced server-side.

### 13. Backend hard rules

> Reference: orbit-api/CLAUDE.md "Cross-cutting hard rules". **Gated: only when the diff
> touches `orbit-api`.**

- **Timezone**: user-facing dates use `IUserDateService.GetUserTodayAsync(userId)`,
  never `DateOnly.FromDateTime(DateTime.UtcNow)`. `DateTime.UtcNow` is only for
  `CreatedAtUtc` timestamps and cache keys.
- **Authorization**: every controller endpoint requires JWT Bearer unless it is
  `/health` or `/api/auth/*`; new endpoints default to `[Authorize]`.
- **Validation**: validators in `Orbit.Application/<Feature>/Validators/` **and**
  domain-entity guards.
- **Logging**: structured, PascalCase properties, English only —
  `logger.LogInformation("Action {Property}", value)`, never interpolated.
- **Tests**: every new command/query handler, validator, and service has a unit test
  (unit only — no integration or E2E suite exists).

### 14. FEATURES.md parity (feature inventory)

> Reference: `FEATURES.md` at the orbit-ui-mobile repo root — the code-derived feature
> inventory (#378). **Gated: only when the diff changes the user-facing feature surface.**

- Triggers: a feature added, materially changed, or removed — new screen/route/tab, new
  or removed Astra (`IAiTool`) or MCP (`[McpServerTool]`) tool, plan-gating change
  (`PayGateService` / `AppConstants`), platform-availability change, or locale-specific
  behavior change. Pure refactors, bugfixes, and visual polish with no behavior change
  are N/A.
- The same PR updates `FEATURES.md` — row added, edited, or removed, with the Gating /
  Platform / Locale columns still accurate, and the stated tool counts corrected when
  tools are added or removed. A missing update is **High** (same bar as a missing
  web↔mobile mirror); a gating or platform claim the diff makes stale is **High** too.
- Headline-set features (Astra, MCP, social, core tracker) also surface in the in-app
  feature guide (`onboarding.featureGuide.*`) — if the change makes the guide wrong or
  incomplete, flag it (**Medium**).
- In the orbit-api repo the file is not in the checkout: do not verify — emit the
  finding as "FEATURES.md update required in thomasluizon/orbit-ui-mobile" (**High**)
  so it lands in the paired frontend PR.

---

## Self-review note

This rubric and the skill that walks it are themselves held to the standard they
enforce: every code snippet here is exemplary (no narration comments, no `any`, no
`console.log`). Dogfood the rubric against the review output before posting.
