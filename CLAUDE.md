# Orbit

Personal habit tracker. Turborepo monorepo: `apps/web`, `apps/mobile` (Android-only), `packages/shared`. Siblings `orbit-api` and `orbit-landing-page` carry their own `CLAUDE.md`, and each workspace has a scoped one, so this root holds only cross-cutting rules.

## Maximum implementation (overrides global rule 4, "surgical changes")

Something broken, stale, or wrong while you build or fix? Fix it in the same PR; never call it "out of scope" or "pre-existing." Exception: `/audit-*` reports against its rubric, it doesn't remediate mid-pass. Do everything yourself (MCP servers, CLIs, APIs); involve me only when there is genuinely no way for you to do it.

## The workflow (D1-D9)

Every ticket lives in the private `thomasluizon/orbit-tickets` GitHub repository (D1). Exactly one `repo:ui`, `repo:api`, or `repo:landing` label routes each ticket to its code repository. The ticket is the prompt (D2); one ticket = one repo = one coherent, independently mergeable PR (D4), with file and line estimates used only as planning signals, and cross-repo work uses an API ticket blocking a UI ticket. `/orchestrate <ticket-reference>` takes exactly one migrated `ORB-N` or GitHub `#N` ticket (D5). The reviewer is never the session that wrote the code, because Pullfrog reviews every pull request from GitHub Actions.

## Cross-platform parity (MANDATORY)

Every change lands in BOTH `apps/web` AND `apps/mobile` in the same task: logic, features, behavior, and error handling identical, reverts included. Allowed differences are platform adapters (BFF vs direct API, cookie vs SecureStore, shadcn vs React Native StyleSheet, next-intl vs i18next) and a layout-shell divergence enumerated in `DESIGN.md`, limited to navigation chrome (sidebar vs tab bar), the command palette and keyboard shortcuts, and hover affordances on that shell chrome. The desktop stats rail was a fourth and is deleted (D69). Everything below the shell, including a screen, component, data flow, error path, or behavior, remains parity-bound. i18n keys land in `en.json` AND `pt-BR.json` in the same edit. The `PR Metadata` job in `pr-metadata.yml` fails a one-sided UI change; the escape hatch is `parity:exempt` with a one-line PR-body justification naming the applicable platform adapter or enumerated layout-shell divergence.

## Code standards

Eleven judgement rules. The mechanical ones (no `any`, no `console.log`, comments, dashes, copy) are enforced by ESLint `local/*`, `guards.yml`, and Roslyn `ORBIT0001..0005`; trust the gates rather than re-checking by eye.

1. **Root cause over workarounds.** No fallback or defensive branch for a problem owned upstream (config, type, util). An unavoidable one gets a one-line WHY comment linking the issue.
2. **Delete unused code immediately.** No "just in case" exports, dead branches, stub functions.
3. **No premature abstraction.** Extract on the third real use, not the second.
4. **Function size & nesting.** Soft cap ~50 lines / ~3 levels, hard cap ~100. Beyond means split.
5. **Error handling at boundaries only.** Validate at trust boundaries (user input, external APIs), trust your types inside, never swallow an error.
6. **Naming.** Descriptive, no abbreviations, never `data`/`info`/`stuff`/`temp`/`obj`/`helper`/`util` as a final name.
7. **DRY at the right level.** Cross-app duplication goes to `packages/shared`, cross-component to `apps/<platform>/components/`, never for one caller.
8. **Never assume an external interface.** Confirm any field, flag, exit code, or response shape from a CLI, API, or library you didn't write against the real response or the installed source: not memory, not `--help`, not what it obviously should be. Never write the fixture that agrees with a guess. Can't confirm it? Don't read it. **The installed source is read-only evidence**: nothing writes inside `node_modules`, ever, and `node tools/check-dependency-edits.mjs` proves the tree you are about to cite is the one the lockfile describes.
9. **Simplest implementation that fully meets the current requirements.** No speculative abstraction, configuration, or indirection.
10. **Grow the system in layers.** Start from the smallest version that works end to end, then add each capability on top of something that already works. Never trade a working product for unfinished complexity.
11. **Lean on the dependencies already here** before writing your own or adding a package; prefer an established, well-maintained library to reimplementing common functionality.

## Security & contracts

Web cookie is httpOnly + sameSite strict + secure; mobile tokens live in SecureStore, never AsyncStorage. Contract types live in `packages/shared/src/types/*` (Zod); never invent a field the API doesn't return. Shared/DTO changes are **append-only and deploy-API-first**: add optional fields, never rename, remove, or retype a field old mobile clients still read (mobile lags via the Play store). Breaking changes use expand-contract plus the `AppConfig.MinSupportedVersion` gate, raised only once the carrying build is live in the Play fleet (#210).

## Brand & design

"Orbit" and "Astra" are never translated. `BRAND.md` is authoritative for audience and positioning: read it before any brand, copy, positioning or design-direction work, and before ORB-30. `DESIGN.md` (repo root) is authoritative for all UI: read it before any frontend work. **`design/canvas/` is the granted Claude Design export.** Read the drawing for the surface you are building, and its tokens. Precedence is a ladder, defined in `DESIGN.md` D42: `## Information architecture` and `## Bans` outrank every drawing, and below those two the drawing outranks `DESIGN.md` prose. A granted export never authorises a banned value. Never build from `design/canvas/superseded/`. **No decorative glow and no gradient wash anywhere**; identity comes from the orbital logo, the Astra glyph, and ring indicators. `--primary` is fill/graphic only, `--primary-soft` accent text.

## Conventions & tooling

- Feature needs backend support? Update the sibling `orbit-api` repo in the same task; it has its own history, branches, and PRs.
- Git: one feature/fix per PR (cross-repo work opens paired, cross-linked PRs); branches `feature/`|`fix/`|`chore/`; `main` is protected (no direct or force push, enforced by `git-guardrails`); squash-merge only; never `--no-verify`/`--no-gpg-sign`; never reuse a squash-merged branch. **Admin merge is forbidden except inside the canonical `/merge-prs` skill after the owner explicitly invokes it for an already-approved frozen PR set.** That skill may use only `gh pr merge --admin --squash --match-head-commit <sha>` under its exact-head preflight. Outside it, STOP and ask the owner. Direct merge APIs remain forbidden without exception: no `PUT /repos/{owner}/{repo}/pulls/{number}/merge`, no direct GraphQL `mergePullRequest`.
- Backport shipping fixes from long-lived branches when they land.
- Review: Pullfrog reviews every pull request in GitHub Actions and publishes `pullfrog-approval`, a required status check on `main` in both code repositories. Its review instructions live in the Pullfrog console, server-side, so no pull request can change the rules it is judged by. A red check means you fix the code.
- Tools follow `tools/CONVENTIONS.md`, cataloged in `tools/README.md`. After changing `tools/**` or `.claude/**`, RUN both harnesses: `node tools/test-tools.mjs` and `node .claude/hooks/test-hooks.mjs`. Review-only evidence is insufficient.
- Testing: Vitest unit tests only, behavior tests for every feature, no new E2E against prod. `TESTING.md` is the catalog plus how to write one.

## Docs registry

Grep a doc's `At a glance` header before loading it. Registry rows and glance headers describe stable purposes; update them only when a purpose changes. Record amendments in the document body.

| Doc | Purpose |
|---|---|
| `BRAND.md` | Audience, positioning and principles; read before brand, copy, positioning or design-direction work, and before ORB-30. |
| `DESIGN.md` | UI specification, authority order, information architecture and bans; read before frontend work. |
| `questions.md` | Run-level redesign questions, decision criteria and resolved composition decisions. |
| `design/canvas/` | Granted drawings, design tokens and surface amendments. Outranks DESIGN.md prose on appearance; never its Information architecture or Bans. |
| `design/google-sign-in-surfaces.md` | Google sign-in mark owners and theme, locale and request-state coverage. |
| `design/habit-row-surfaces.md` | Habit row owners, rounded-square check states, per-row surfaces, retained behaviours and web and Android verification boundaries. |
| `design/personal-text-focus-inventory.md` | Expanded typed-text owners, native action separation, overflow-only keyboard stops, unclamped rename headings and the mobile adapter. |
| `design/calendar-day-surfaces.md` | Calendar day paint owners, full-column targets, loading geometry and platform mirrors. |
| `design/label-row-control-inventory.md` | Label-row inline control consumers, shared centring and first-line alignment, platform mirrors and geometry coverage. |
| `design/field-inset-inventory.md` | Text control owners, typed foreground ownership, drawn inline padding, shared checklist add Input insets, platform mirrors and field geometry verification. |
| `design/calendar-import-sheet-inventory.md` | Calendars sheet surfaces, platform owners, retained behavior and verification boundaries. |
| `design/sheet-footer-inventory.md` | Sheet footer owners, platform mirrors and states covered by the trailing-action contract. |
| `design/progress-grid-surfaces.md` | Responsive Progresso achievement tracks, card text, adjacent stat and goal list audit, platform owners and geometry coverage. |
| `design/create-goal-sheet-inventory.md` | Direct goal creation entries, shared form states, linked-habit picker and platform coverage. |
| `design/astra-conversation-participants.md` | Astra participant avatar owners, continuation spacing, text, block and running tool trace alignment, and pending reply replacement. |
| `design/astra-block-copy-surfaces.md` | Astra reply code-block copy owners, independent confirmations, user and description exclusions, and platform verification boundaries. |
| `design/astra-pending-reply-surfaces.md` | Astra pending reply owners, terminal replacements, polite announcement ownership and hermetic verification boundaries. |
| `design/astra-preview-surfaces.md` | Astra preview item semantics, counted actions, breakdown footer disclosure, deletion confirmation, revision, terminal outcomes and responsive parity. |
| `design/progress-surfaces.md` | Progresso overview and sub-screen owners, retained figures and actions, states and verification coverage. |
| `design/subscription-surfaces.md` | Assinatura presentation inventory, shared frame start edge and wide shell ownership, shared purchase consumers, retained billing transitions and platform verification owners. |
| `.claude/manifests/feature-parity.json` | Generated web and Android capability inventory, removal citations and restoration tracking. |
| `tools/feature-parity-rules.json` | Exact capability relocations, owner removal citations and restoration tickets; the checker derives completion from source. |
| `.claude/specs/orbit-prod-release.md` | Production release rules, capability restoration scope and release verification. |
| `AGENTS.md` | Codex's worker entry doc; defers to this file. |
| `apps/web/DEPLOYMENT.md` | Web image build, GitHub settings, and Render releases with redesign Worker route verification. |
| `packages/shared/CONTRACT_DRIFT.md` | Pinned API snapshot check and automated rebaseline. |
| `.claude/skills/pr-review/rubric.md` | The dimensions `/audit-code-quality` audits against; its only consumer. |
| `gating-matrix.json` | Generated inventory of PayGate methods, config keys, and feature flags at the `thomasluizon/orbit-api` repository root; run `node tools/gating-matrix.mjs` there to create it. |
| `FEATURES.md` | Retained Astra and MCP tool-count inventory that no generated artifact carries; verify every count against its named `orbit-api` source. |
| `.claude/skills/flag/SKILL.md` | Inspect and change production or staging feature flags through admin Orbit MCP, with before and after verification. |
| `.claude/skills/flag/guide.md` | Plain and version flags, account targeting, flag lifecycle, build selection, and API versioning. |
| `TESTING.md` | Test authoring rules, suite catalog, CI ownership and local verification commands. |
| `architecture.json` | Generated route and screen map, plus endpoints, dependencies, i18n ownership, and test coverage; NOT committed (#470). Run `node tools/arch-map.mjs` once, then read it INSTEAD of exploring the codebase; it also writes `architecture.html` and the `architecture.mmd` diagram. Its first key is a `provenance` block whose `generatedFrom` hashes every input the generator read, so a copy can be checked against the tree in front of you. |
| `.claude/rules/core.md` | Always-loaded judgement and D89/D90 operating-contract pointers. |
| `.claude/calibration.json` | Agent and skill model calibration, effort settings and launch contracts. |
| `.claude/skills/ticket/SKILL.md` | GitHub ticket creation, labels, relations, and milestone rules; generated architecture maps are read locally and never committed. |
| `.claude/skills/orchestrate/SKILL.md` | Ticket execution, worker dispatch, verification, review, readiness and session relay procedures. |
| `.claude/skills/handoff/SKILL.md` | Spec-driven handoff, living work orders, in-flight inventory and session relay procedures. |
| `.claude/skills/sleep/SKILL.md` | Unattended orchestrator entry, session adoption and owner reporting. |
| `.claude/skills/wrap-up/SKILL.md` | Closes a session in one command: `/progress`, then `/questions`, then `/handoff`, with `--sleep` passed through to the last one. An open chain extends both reporting passes across every relay and the current session before owner handoff closes it. |
| `.claude/skills/questions/SKILL.md` | Owner decision criteria and the procedure for unavoidable manual actions. |
| `.claude/skills/progress/SKILL.md` | Product-level progress reporting from live delivery artifacts. |
| `.claude/playbooks/redesign-screen.md` | Thirteen-screen D76 loop; D90 suspends human steps 1/3/7/8, keeps 2/4/5/6 and the ui-skills sweep. |
| `.claude/rules/visual-delivery.md` | Visual inventory and critic gates; D90 moves human inspection to the whole-redesign review. |
| `.claude/skills/android-generate/SKILL.md` | Local APK build, and the emulator install path. Read before building or running the Android app. |
| `.claude/skills/android-release/SKILL.md` | Dispatching `android-release.yml` to a Google Play track. |
| `.claude/skills/release/SKILL.md` | Planning production, opt-in redesign web, and staging gaps, with Worker route verification and go-live dependencies. |
| **D1..D42 register** | Historical decision record in the brain vault: `2 Areas/20-29 Orbit Engineering/Decisions/`. Current ticket routing is defined here. |

**Research reports do not live in this repo**: they go stale silently, then get cited as authority long after they expire. Durable knowledge is an ADR in the brain vault; `/deep-research` writes there.
