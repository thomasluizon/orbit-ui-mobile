# REBUILD: the Orbit workflow teardown and rebuild

**At a glance:** the complete, self-contained plan for replacing the `/drive` harness with a
Linear-driven, wave-based, merge-gated workflow. Every decision reached in the 2026-07-23
planning session is recorded here with the evidence that produced it. This file is the source of
truth until the rebuild lands.

**Lifecycle:** this document is temporary by design. It dies when Phase 7 completes. Its durable
parts graduate to `CLAUDE.md`, `AGENTS.md`, `DESIGN.md`, and brain ADRs. Do not let it survive as
a stale artifact.

**Status: PHASES 0-5 EXECUTED 2026-07-24. Phase 6 next, then Phase 7.** Phases 0-4 done
(branches archived, Dependabot merged, worktrees gone; 5 guard PRs; both arch-map PRs; the
orchestrator PR, wave machinery proven against live Linear). Phase 3 (the deletion) executed:
section 5 carried out with the D39 survivors honored (`surface-manifest.mjs`, `surfaces.json`,
`capture-surfaces.mjs`, `redesign-coverage.mjs`), `CLAUDE.md` and `.claude/rules/core.md`
rewritten, the old wired hooks + Harness Hook Parity CI job deleted (merged PR #581,
32k lines). Phase 5 executed: the full Linear board exists in workspace `useorbitai`, team
`ORB` (id `99996489-8aad-4e01-a8f9-6123adfb7d6b`): **539 Redesign** 26 tickets (launchable
ORB-30), **562 Astra** 17, **Launch** 11, **PostHog** 8 (ORB-75..82, launchable ORB-75, an
adopted feature cut via the new /feature flow), **Brand Assets** 2, **Backlog** 12; ~40 GitHub
issues closed with Linear pointers; stay-GitHub: ui#387, api#319, landing#43, landing#42. The
D38 file-level coverage assertion, the wave-plan cross-project-blocker fix, and the
/orchestrate overview-content fetch all merged (PRs #582/#583/#584). Linear API key at
`~\.linear-api-key` (read at call time, never echoed); each project's locked decisions live in
its OVERVIEW CONTENT, not the 255-char description.

**Phase 6 COMPLETE 2026-07-24.** All four items done. (1) The mechanical-debt work was NOT cut
as its own project: the suppression debt is drained inside the #539 per-surface tickets, which
already own their files under D38, and seed ticket **ORB-46** was rewritten as the terminal
backstop that flips the ratchet to must-equal-zero once every R ticket has merged. A separate
batch-drain project would have double-owned files, a D4/D35/D38 defect. (2) `/prod-readiness`
and the 4 `/audit-*` redesigned to D10/D11 (PR #588). (3) Docs sorted per D12; `WORKFLOW.md`
deleted (PR #586). (4) The skill sweep ran across all 48 skills, 13 batched agents, one PR per
repo (#590, api #434). Vendored skills (Orca, accesslint, impeccable, obsidian-markdown, the
`brain-*` family) got recommendations only, never writes, so an upstream update cannot clobber
them. Also landed in Phase 6: **D42** and the context-engineering playbook (#592), and the
frontmatter gate (#593).

**Phase 7 needs Thomas:** the end-to-end proof run (best candidate ORB-75) needs a PostHog EU
Cloud account + `codex login` on ChatGPT Pro first. The denominator audit register is in 8.5; raw
output at `brain/2 Areas/20-29 Orbit Engineering/denominator-audit-2026-07-24 (raw, #539).json`.

---

## 1. Why we are tearing it down

### 1.1 The measured size of the current harness

| Path | Files | Lines |
|---|---|---|
| `.claude/workorders/` | 215 | 17,960 |
| `.claude/drive/` | 104 | 7,412 |
| `.claude/skills/` | 39 | 7,301 |
| `tools/` | 19 | 5,778 |
| `.claude/hooks/` | 29 (17 wired) | 5,179 |
| `.claude/agents/` | 12 | 562 |
| `.claude/playbooks/` | 4 | 295 |
| `.claude/rules/` | 3 | 198 |
| **Total** | **~425** | **~44,700** |

### 1.2 The four mechanical failures on #539

Established from the repo's own records, not from theory.

1. **The spec is subtractive.** `DESIGN.md` and every ESLint gate state what must be absent (no
   glow, no gradient, no stacked hairlines, no off-scale spacing, no arbitrary z-index). An agent
   satisfies 100% of that by deleting things. Nothing tells it what to build. The user's own
   defect log (`.claude/specs/issue-539-user-found-defects.md`) closes with: *"All six passed
   every gate. The gates are subtractive so they prove banned things are ABSENT and say nothing
   about whether a surface is good. Green gates never close a taste task, only a rendered
   artifact does."*
2. **Nothing in the loop rendered a picture.** The completion judge scored AST signatures. Its
   recall against the 12 human-found defects is 0/12, recorded in `CLAUDE.md`.
3. **The work unit was wrong.** `surfaces.json` carries 171 surfaces x 2 themes x 2 locales =
   804 cells. 0 signed. Design is compositional: 171 screens are made of roughly 8 primitives.
   The harness polished 804 leaves and never touched the trunk, which is why hours of work
   produced no visible change.
4. **Honest work was recorded as failure.** `.claude/harness-issues.md` defect H1: the ownership
   gate measured the uncommitted working tree, so an operator editing any tracked file while a
   child ran caused `status=failed`. `maxConsecutiveFailures` is 3, so three such artifacts halt
   a clean run.
5. **Half the app could never be photographed, and that was being read as progress.** Measured
   2026-07-23 from `surfaces.json` itself: of 804 cells, `pixelEvidence` is `web-capture` for
   **396** and `none` for **408** (all 348 mobile cells, plus 60 web). **408 is exactly the
   "408 defect-clear" figure Thomas had been reading as progress.** Those cells were never judged
   clean; they were clean because no picture of them exists, so the defect veto had nothing to
   fire on. A veto that cannot see is indistinguishable from a pass.

   | | Web | Mobile | Total |
   |---|---|---|---|
   | Unique surfaces | 99 | 72 | **171** |
   | Route + view cells | 180 | 264 | 444 |
   | Overlay cells (modals and sheets) | 276 | 84 | **360** |
   | Cells | 456 | 348 | **804** |
   | Cells with a capture mechanism | 396 | **0** | 396 |

### 1.3 The state of PR #560

911 files, +20,430 / -8,220. Of that, **652 files are real app code** (349 web, 303 mobile) plus
`DESIGN.md` and 4 ESLint rules. Lint, Type Check, Build, React Doctor and Contract Drift all
pass. It is not empty; it is unreviewable.

### 1.4 Pre-existing debt the gates cannot see

| Ledger | Files |
|---|---|
| `apps/web/eslint-suppressions.json` | 146 |
| `apps/mobile/eslint-suppressions.json` | 125 |
| **Total** | **271** |

All 271 are the same rule, `local/spacing-scale`. New violations do fail lint (a new file is not
suppressed). Nothing drives the existing 271 down, and no CI job asserts the suppression files do
not grow. It is a ratchet with no handle.

---

## 2. Locked decisions

Numbered so they can be cited. Do not re-litigate without a superseding entry.

| # | Decision |
|---|---|
| **D1** | **Linear is the source of truth for product work** (orbit-ui-mobile + orbit-api). GitHub Issues holds orbit-landing-page, infra chores, and Dependabot. |
| **D2** | **The ticket is the prompt.** A ticket that a fresh agent with no session history cannot execute is a defective ticket. Required fields in section 6.2. |
| **D3** | **Merge-gated waves.** A ticket starts only when every blocker is merged to `main`. Every PR targets `main`. No stacked branches. A human merge is the only thing that advances a wave. |
| **D4** | **One ticket = one repo = one reviewable PR**, target under 400 lines for non-trivial work. Web and mobile parity stays inside a single orbit-ui-mobile PR. Cross-repo work splits into an api ticket that **blocks** a ui ticket, which makes the deploy-API-first rule a DAG edge rather than prose. |
| **D5** | **The worker engine is configurable**: `claude` \| `codex` \| `auto`, set in `.claude/orchestrator.json`. Default is `claude` today. Flipping to `codex` is a one-word edit. `auto` picks Codex when logged in, falls back to Claude, and states which it chose in the wave table. |
| **D6** | **Claude Code hooks do not run for Codex.** All 17 wired guards must exist as ESLint rules, Roslyn analyzers, lefthook steps, or CI jobs **before any worker runs**. This phase cannot be reordered. |
| **D7** | **Evidence gate.** A ticket labeled `visible-effect` cannot reach In Review without a screenshot and test output attached to the Linear issue. |
| **D8** | **Reconcile before dispatch.** The orchestrator opens the cited file and confirms a review finding reproduces before it becomes work for a worker. Applies equally to humans, CodeRabbit, and agents. |
| **D9** | **Two strikes.** A ticket that fails twice sets `attempts:2` and the orchestrator refuses to launch it again until the ticket body is rewritten. Two failures means the spec is wrong, not the agent. |
| **D10** | **An audit's output is Linear tickets, never a report.** A report is a photograph that starts lying the day after it is written. |
| **D11** | **An audit looks only for what no gate can check.** Gates own the mechanical layer. Audits own judgement. Never both. |
| **D12** | **Every document is one of three things**: generated and CI-verified fresh, authoritative-and-small (rules, not facts about code), or deleted. Anything that claims to describe the code and is not generated is a lie waiting to happen. |
| **D13** | **Only a human grants visual completion.** No machine judge. Deterministic signals may withhold, never grant. (Carried forward from the existing ADR.) |
| **D14** | **The design direction is chosen by Thomas from a visual reference board**, not by an AI skill. Generic "improve UI" skills produce the average of their training data, which is the definition of slop. |
| **D15** | **`DESIGN.md` must carry mechanical specs, not only taste.** Section 8.3 lists the missing ones. Each must be enforceable as a lint rule. |
| **D16** | **ui-skills: install the router only.** Everything else is named in the ticket body and fetched with `npx ui-skills get <name>`. Works identically for Claude and Codex. Zero permanent context cost. |
| **D17** | **The session always opens in `orbit-ui-mobile`.** Forever. The orchestrator spawns worktrees into whichever repo the ticket targets. Thomas never changes directory. |
| **D18** | **#539 is restructured** into ticket 0 (rewrite `DESIGN.md`), then 4 system tickets, then 14 screen tickets, then the spacing debt. Not 804 cells. **Superseded in detail by 8.2.1**, where the 18 are derived from the manifest rather than chosen, and by 8.5, which will add tickets for the denominators the manifest cannot see. |
| **D19** | **Local-first feel is part of #539.** Half of why a premium app feels premium is that nothing ever waits. Orbit's core action is tapping a checkbox many times a day. |
| **D20** | **A new app icon, Play Store graphics, landing page and OG images are expected and fine.** They get their own Linear project, blocked only by ticket 0, blocking no code ticket. |
| **D21** | **The skill rewrite pass runs after the deletion**, on survivors plus new skills. Rewriting a skill the day before deleting it is waste. |
| **D22** | **opencode is dropped.** `.opencode/` and its parity tests are deleted, the "never create AGENTS.md" rule is removed, and `AGENTS.md` is created for Codex. |
| **D23** | **`/drive 562` is never run again.** The 562 spec becomes a Linear project. |
| **D24** | **CodeRabbit is rejected.** Its rubric is opaque and generic; it cannot know the parity contract, the append-only DTO rule, `MinSupportedVersion`, the spacing scale, or `DESIGN.md`, which is where Orbit's real regressions live. Adding a reviewer whose every finding must pass D8 reconciliation is negative value when a rubric you wrote already exists. |
| **D25** | **No new CI review workflow. `claude-review.yml` stays the sole decider, unchanged.** It runs `/pr-review` against `rubric.md` and posts exactly one APPROVE or REQUEST_CHANGES on the Claude OAuth token already in use. **`openai/codex-action` is rejected**: it requires `openai-api-key` (per-token API billing, separate from any ChatGPT plan), and its subscription workaround (storing `~/.codex/auth.json` as a CI secret) is ruled out three times over. OpenAI's doc says *"Do not use this workflow for public or open-source repositories"* and **all three Orbit repos are PUBLIC**; the refreshed `auth.json` must be written back to secret storage every run; and it requires *"one auth.json per runner or serialized workflow stream, avoid concurrent job access"*, which contradicts 8 parallel PRs per wave. |
| **D26** | **The second reviewer is the Codex cloud GitHub integration, steered by `AGENTS.md`.** This is a different product from `codex-action`: subscription-backed, no API key, no CI secret, no runner concurrency, works on public repos. Enabled once at `chatgpt.com/codex/settings/code-review` (Automatic reviews). It flags P0 and P1 only and **reads `## Code Review Rules` from `AGENTS.md`**, including nested files that override by directory, mirroring the scoped `CLAUDE.md` layout. This makes `AGENTS.md` load-bearing three ways: Codex CLI worker instructions, Codex cloud reviewer instructions, and the review prompt itself. Division of labour: `claude-review.yml` owns the verdict and the full rubric; Codex owns P0/P1 comments on the judgement-only traps. |
| **D28** | **The design direction is "dense and warm".** Linear's and Raycast's structural discipline as the skeleton, Copilot Money's temperature and colour-as-data, and one Apple-grade interaction on the check. Chosen 2026-07-23 from the reference board. Not pure Linear (tried, came out bland, because its restraint rests on type and density discipline Orbit lacked). Not Duolingo (its non-genericness is an illustration and animation budget Orbit does not have; without it, chunky buttons plus saturated palette plus confetti is the most-copied look on the Play Store, which IS the generic being avoided; it also fights Astra, a text surface). |
| **D29** | **The six colour schemes are deleted. Orbit gets ONE brand accent.** Measured: 48 of 65 users (74%) are already on purple or default; the other 17 split blue 5, cyan 5, rose 3, green 2, orange 2. A user-selectable accent can never carry meaning, and six hues force every component to survive six palettes. Cost is 17 beta users seeing one colour change. |
| **D30** | **`Habit.Color` becomes a first-class field, assigned automatically.** A curated palette of about 8, assigned deterministically at creation, user-editable, backfilled for the existing 975 habits in the same migration. **The rule this encodes: any identity carrier that is opt-in will be empty for most rows.** Measured: tags cover 90 of 975 habits (9.2%) and 9 of 65 users; emoji covers 314 of 975 (32%). That is the mechanical reason the list renders as identical rectangles. Tags are demoted to grouping and filtering; they never carry the visual system. This is an `orbit-api` ticket that **blocks** a `orbit-ui-mobile` ticket. |
| **D31** | **Emoji stays, monochrome, tinted by the habit's assigned colour.** Verified: Google Fonts serves `Noto Emoji` as a variable font, weight 300 to 700, woff2. A colour-bitmap emoji font cannot carry a weight axis, so these are outlines and inherit CSS `color`. Deleting emoji is out (user data, 314 habits). Full-colour emoji is the "out of place" problem: each arrives with its own art direction and is the only saturated multi-colour object on a disciplined screen. |
| **D32** | **The logo is redone.** `apps/mobile/assets/icon.png` is the ringed-planet emoji recoloured purple with a glow. It is someone else's artwork, it glows and gradients (both banned everywhere else in the app), and it is locked to one hue. Brief: works in ONE flat colour, legible at 16px and at 512px, no gradient, no glow, no ring-inside-ring detail. |
| **D33** | **`npx getdesign@latest add <site>` is used for the LANDING page, and only for the SHAPE of the app's `DESIGN.md`.** Verified by running it: 548 lines, genuinely mechanical (exact hex, per-size letter-spacing, radius table, elevation table), but its own header says `Source pages: linear.app (home), /intake, /pricing, /contact/sales, /build` and its components are `pricing-card`, `pricing-tab`, `footer`, `testimonial`. **Zero list rows, zero density specs, zero state specs.** Its own Known Gaps admits the product UI has a richer colour-tag palette it never captured. Copying marketing calm onto a product screen is exactly what made the last attempt bland. |
| **D34** | **Separation uses exactly ONE of: a surface step, a hairline, or space. Never two on one boundary.** A hairline appears only between siblings inside one group; groups separate by space. A surface step and a hairline may coexist only on the outer edge of a lifted panel. This is the mechanical form of the "too many dividers, unstandardised" defect. |
| **D35** | **The redesign's denominator is derived and CI-asserted, never chosen by whoever is complaining that day.** `tools/redesign-coverage.mjs` partitions all 171 surfaces into 18 tickets and **exits 1 if any surface is claimed by zero tickets**. It already caught 3 surfaces that would have been silently skipped, including the command palette, which is defect 1 in the human defect log. **The manifest is only ONE denominator**; see section 8.5. |
| **D36** | **The redesign ships ALL AT ONCE, via an integration branch, not a feature flag.** Thomas: deploying parts of the app redesigned while the rest is old makes no sense. Verified this is a real risk: `app.useorbit.org` is the production domain of the Vercel project `orbit-ui-mobile-web`, which tracks `main`, so every merged redesign PR would deploy immediately. **Mechanism:** every ticket in the #539 project targets a long-lived `redesign/main`, reviewed and merged there individually at normal PR size. When the last one lands, `redesign/main` merges to `main` once, and that single merge is the deploy. Orca supports this natively: `orca worktree create --base-branch redesign/main`. **This is not PR #560 again**: #560 was ONE 911-file PR reviewed once; here 18+ PRs are each reviewed at target size, and the final merge carries only already-reviewed commits. **Drift control:** a CI job merges `main` into `redesign/main` on every push to `main`, so conflicts surface small and continuously (the measured lesson "a merge resolves a long-diverged branch more safely than a replayed rebase"). Rejected alternative, the feature flag: it means maintaining two component trees for the whole redesign, which for one developer and 65 beta users costs far more than it buys. **This amends D3 for the #539 project only**; every other ticket still targets `main` and deploys normally. |
| **D37** | **`orbit-api` is exempt from D36 and keeps targeting `main`.** The API half of the redesign (`Habit.Color`, D30) is an additive optional column and DTO field, which is backward compatible by the append-only rule and must deploy BEFORE the UI that reads it. Holding it back would invert deploy-API-first. Only `orbit-ui-mobile` uses the integration branch. |
| **D38** | **Every denominator has an owner, recorded in 8.5.** The measured register (audit `wf_f92a2a55-14d`, landed 2026-07-24) adds three tickets the manifest could not see: `R19-copy-voice` (the 2,905-key copy pass), `R20-comms` (orbit-api: emails, AI push copy, error messages), `R21-widget` (the Android home-screen widget), plus the landing-page redesign in its own repo and the D20 brand-asset project. Animations are distributed to owning tickets from the audit's 69-item enumerated list, never left implicit. Component states (the 8 DESIGN.md mandates) become per-ticket acceptance criteria under D7, never new manifest cells; multiplying 804 cells by 8 states would rebuild the machine D18 killed. In Phase 5, `tools/redesign-coverage.mjs` grows a second assertion: every `.tsx` under `apps/*/app` and `apps/*/components` maps to exactly one ticket by directory rule, exit 1 on orphans. |
| **D39** | **`surface-manifest.mjs`, `surfaces.json` and `redesign-coverage.mjs` survive Phase 3 until the #539 project completes.** The coverage gate reads the manifest; deleting it with the rest of the 804-cell machine (section 5) would orphan the redesign's denominator. The judge, signoff and verdict machinery still dies on schedule. The manifest folds into `arch-map.mjs` when #539 closes. |
| **D40** | **The landing page and the emails switch the same day the app does.** The landing repo gets its own `redesign/main` integration branch (D36's mechanism, second repo), merged the same day as the app's; `R20-comms` (orbit-api) merges to `main` right before the switch. Chosen by Thomas 2026-07-24 over landing-leads and landing-trails. |
| **D41** | **The logo: Claude generates flat-SVG candidates against the D32 brief, Thomas picks or rejects.** Same pattern as the reference board. Rejection loops with new candidates; commissioning stays available as the fallback if no round survives. Chosen by Thomas 2026-07-24. |
| **D42** | **A rendered reference outranks a written spec, and ticket 0 ships one.** Anthropic's 2026-07-24 context-engineering guidance for 5-generation models states that a rendered mockup produces better results as agent input than a description or a screenshot. That is a direct diagnosis of the #539 failure: 1.2 records the causes as "the spec is subtractive" and "nothing in the loop rendered a picture", and `DESIGN.md` carried one mechanical rule with everything else as prose adjectives. So **ORB-30 also produces `design/reference.html`**, one self-contained page rendering every token, the type scale at real sizes, each list density as real rows, all 8 states per primitive, the habit-colour palette on real rows, and D34 shown correct beside violated. Where the page and the prose disagree, **the page wins and the prose is the defect**. The ticket carries `visible-effect` so the D7 evidence gate binds, and Thomas's approval of that page is the D13 human grant that unblocks R1 to R21. Generalised into `.claude/playbooks/context-engineering.md` (read before authoring anything the agent reads), whose other seven rules mostly corroborate conclusions this repo had already measured. |
| **D27** | **`## Code Review Rules` covers only what no gate can check.** OpenAI's own guidance matches D11: *"Keep formatting and other mechanical checks in CI."* Their measurement: well-scoped rules reach 98% violation recall while staying quiet on clean diffs; broad rules produce noise. **Do not restate** the lint rules, the comment policy, `DateTime.UtcNow`, or the authorization attribute; all become deterministic gates in Phase 1. **Do state**, each with a safe path: (1) a DTO field renamed, removed or retyped that a shipped mobile client still reads, which `Contract Drift` cannot judge because it does not know the Play fleet lag; (2) `AppConfig.MinSupportedVersion` raised before the carrying build is live; (3) a mobile mirror that exists but behaves differently from the web change, which the CI parity job cannot see; (4) a load-bearing string changed (URL slug, anchor id, primary nav label, form field `name` or order), which is `core.md` rule 4 and has no gate. |

### 2.1 Decisions carried in from existing ADRs (unchanged)

- Astra (the product AI) stays on **gpt-4.1-mini**. gpt-5.4-nano only if it passes the ui#537
  eval corpus after the tool trim. gpt-5.4-mini and gpt-5.6 Luna rejected as cost regressions.
- Cross-platform parity is mandatory: web and mobile land together, i18n keys in both `en.json`
  and `pt-BR.json` in the same edit.
- Shared and DTO changes are append-only and deploy-API-first.
- Never use the em dash character, anywhere.
- `main` is protected. Squash merge only. Never reuse a squash-merged branch.

---

## 3. Target architecture

### 3.1 Two verbs

| Thomas wants | Types | Gets |
|---|---|---|
| A feature | `/feature <idea>` | A Linear **project**: N tickets with an explicit `blockedBy` graph |
| A bug fixed | `/bug <description>` | **One** Linear ticket, same format |
| Any of it built | `/orchestrate <project or ticket>` | Waves of worktrees, PRs, CI green, review-ready |

Thomas's job reduces to: talk to the PM agent, then review and merge. Merging advances the wave.

### 3.2 The loop

1. `/feature` runs in the orbit-ui-mobile session. `product-manager` and `design-specialist`
   agents interrogate the idea, then create the Linear project and tickets. No code.
2. `/orchestrate` reads the project, builds the DAG, prints the wave table.
3. Wave 1 = every ticket with no open blockers. One Orca worktree per ticket, cut from fresh
   `origin/main`, running the configured worker engine.
4. Each worker: In Progress -> implement -> lint/type/test -> commit -> push -> PR to `main` ->
   attach PR to Linear -> In Review -> stop. Never merges.
5. The orchestrator babysits CI and review state (keyed by branch + head SHA + feedback
   fingerprint), applies D7, D8 and D9.
6. Thomas reviews and merges. The orchestrator fetches main, recomputes cleared blockers, and
   launches the next wave.

### 3.3 Where work happens

| Work | Command | Worktree opens in |
|---|---|---|
| Web or mobile app | `/feature` or `/bug`, then `/orchestrate` | orbit-ui-mobile |
| API | same commands, same session | orbit-api |
| Both | same commands, same session | two tickets, api blocks ui, two worktrees in order |
| Landing page | just say what to fix | nowhere; edited directly in this session |

---

## 4. Tools, accounts, environment

### 4.1 Verified present

| Thing | State |
|---|---|
| Orca CLI | `C:\Users\thoma\AppData\Local\Programs\orca\resources\bin\orca`, app v1.4.152 |
| `orca linear` | Full CLI: `project list`, `list-issues`, `issue --relations`, `save-issue`, `create`, `relation add`, `status set`, `attach`, `comment add`. **No Linear MCP needed.** |
| Codex CLI | v0.118.0 installed, `~/.codex/config.toml` nearly empty (Pencil MCP only), **no paid account yet** |
| Claude Code | v2.1.214, `tui` switched to `fullscreen` |
| `gh` CLI | present |
| ESLint custom rules | 30 in `eslint-rules/` |
| CI workflows | 18 in `.github/workflows/` |

### 4.2 Verified missing, must be fixed

| Gap | Fix | Owner |
|---|---|---|
| Linear workspace not connected (`orca linear team list` returns `teams: []`) | Create account, connect in Orca | Thomas |
| **orbit-api and orbit-landing-page not registered in Orca** (`orca repo list` shows only orbit-ui-mobile, brain, gta6-shorts-factory, portfolio) | `orca repo add --path <path>` | Claude |
| ~~`.claude/specs/issue-562.spec.md` is **not in git** (187 lines, local only)~~ | **DONE.** Backed up to the vault as `0 Inbox/issue-562 spec backup (2026-07-24).md` and `2 Areas/20-29 Orbit Engineering/Orbit ui562 Astra epic spec (rescued from gitignore 2026-07-23).md`, extracted to the 562 Astra Linear project (17 tickets), then deleted with the rest of `.claude/specs/` on 2026-07-24 | Claude |
| No `AGENTS.md` in either repo | Create in Phase 4 | Claude |

### 4.3 Linear plan

Free tier: 250 non-archived issues, 2 teams, unlimited members, 10MB uploads, full API and
integrations. Current need is about 60 tickets. **Do not pay.** Basic is $10/user/month if the
250 limit is ever approached.

Workspace `Orbit`, one team `Orbit`, key `ORB`. Workflow states will be read with
`orca linear team states` and the orchestrator adapted to whatever exists, rather than assumed.

---

## 5. What gets deleted

| Path | Files | Lines | Reason |
|---|---|---|---|
| `.claude/workorders/` | 215 | 17,960 | The ticket is the prompt now |
| `.claude/drive/` | 104 | 7,412 | Replaced by `/orchestrate` |
| `.claude/skills/drive/` | 1 | 1,465 | Same |
| `.claude/manifests/` + 8 visual-gate tools | ~10 | ~3,500 | The 804-cell machine. Replaced by the per-ticket evidence gate. **Amended by D39:** `surfaces.json`, `surface-manifest.mjs` and `redesign-coverage.mjs` survive until #539 completes |
| Skills: `implement`, `plan`, `prime`, `batch-grill`, `create-stories`, `create-prd`, `prd-interactive`, `feature` (old), `handoff`, `mirror-harness`, `provider-update` | 11 | ~2,500 | Folded into the PM agent and the worker prompt |
| Agents: `primer`, `implement-opus`, `implement-sonnet` | 3 | ~150 | Orca worktree + an explicit CLI command replaces model routing |
| Hooks: `surface-coverage-gate`, `forbid-gate-tamper`, `primer-shell-allowlist` | 3 | ~900 | They guard deleted things |
| `.opencode/` + its 19 parity assertions | - | - | D22 |
| `.claude/specs/`, `.claude/plans/`, `.claude/audits/` | ~20 | - | After extracting 562 to Linear and the vault. **`.claude/specs/` DONE 2026-07-24**: it was never tracked in git, so it held three local-only files. 562 was extracted to Linear and the vault first (4.2); the denominator audit's raw output moved to `brain/2 Areas/20-29 Orbit Engineering/`, byte-compared before the delete, and this document's three references repointed there. `.claude/audits/` still holds `prod-readiness-both.md`, which section 14 item 4 flags for deletion under D10 |

**Roughly 34,000 of 44,700 lines. About 75%.**

Kept from `tools/`: `capture-surfaces.mjs` (becomes the evidence-gate screenshot mechanism) and
`surface-manifest.mjs` (evolves into `arch-map.mjs`).

---

## 6. What gets built

### 6.1 The guard migration (Phase 1, blocking)

**EXECUTED 2026-07-24.** The ledger below records where each hook actually landed and the proof;
PRs: orbit-ui-mobile **#578**, orbit-landing-page **#46**, orbit-api Roslyn PR in flight. One
planned deviation: the copy rules became a **checker script**, not ESLint, because ESLint does not
parse JSON without a new language plugin and the landing repo's copy lives in a `.ts` table
needing the same values-only extraction anyway; one script, vendored per repo, same shape as the
dash checker. The old hooks stay wired until Phase 3 deletes them (double coverage, no gap).

| Hook today | Landed as | Proof |
|---|---|---|
| `forbid-em-dashes` | `tools/check-dashes.mjs` + Dash Ban CI (changed files, shrink-only baseline, PR title/body) + lefthook, in ui + landing (api via its PR) | ui baseline 170 files / 684 dashes; landing 1; `--text` with an em dash exits 1, an en-dash numeric range exits 0. The gate caught an em dash written while building it |
| `forbid-ai-cliche-copy`, `forbid-placeholder-content`, `forbid-typed-uppercase`, `forbid-hardcoded-brand-color` | `tools/check-copy.mjs` (whole-file, values-only, token-derived color bans) + Copy Register CI + lefthook | ui baseline = exactly the 2 known eyebrow strings x 2 locales; landing baseline empty; closes 6.1.2 gap 1 (added-text-only) and the ungated `translations.ts` |
| `forbid-ts-antipatterns` | `local/no-double-assertion` + `local/no-unjustified-disable` (new, error, 3 workspaces) + tseslint recommended already at error (`no-explicit-any`, `ban-ts-comment`, `no-console`) | 21 RuleTester cases; 57 web + 2 shared pre-existing double assertions were ALL in `__tests__`, exempted exactly as the hook did |
| `forbid-mobile-supabase-eager` | `local/mobile-supabase-lazy`, config-scoped to `supabase.ts` | RuleTester: module-scope throw + eager createClient caught; lazy accessor silent |
| `forbid-expo-pin-bump` | Expo SDK Pin CI job: `npx expo install --check` when `apps/mobile/package.json` changed | mechanical resolution check against the SDK set |
| `forbid-secret-in-argv` | GitGuardian already covers PRs; dropped | n/a |
| `csharp-authz`, `csharp-tz`, `csharp-fluentconfig` | Roslyn analyzers `ORBIT0003..0005` (orbit-api PR, in flight), tz scoped to ALL FOUR projects per 6.1.2 gap 2 | analyzer unit tests; ledger in that PR |
| `parity-nudge` | Cross-Platform Parity CI job: web-scope UI change with zero mobile-scope change fails (and inverse); escape = `parity:exempt` label | fires on 1-file drift, killing 6.1.2 gap 5 (the 3-edits-in-one-session threshold) |
| (no gate existed) | Suppressions Ratchet CI + `tools/check-suppressions-ratchet.mjs`: baselines only shrink; escape = `ratchet:reseed` label | closes 6.1.2 gap 3; `lint:prune` scripts added web + mobile |

Also done: lefthook lints staged `apps/mobile` (was web + shared only); `packages/shared` gained
`no-console` at error (6.1.2 gap: both apps had it, the shared surface did not).

#### 6.1.1 The dash ban is cross-repo and cross-language, so it is not an ESLint rule

The standing rule is "never use the em dash character, anywhere." What actually exists today is
`checkEmDashes` in `_lib/rules-content.mjs:11`, which fires on **three path patterns only** and
returns `null` for everything else:

```
/\/i18n\/[^/]*\.json$/                      packages/shared locale JSON
/\/[Ee]mail\// or ResendEmailService.cs     API email copy
/orbit-landing-page\/src\/.*\.astro$/       landing markup
```

Measured gaps as of 2026-07-23:

| Surface | Gated today | Evidence |
|---|---|---|
| `orbit-landing-page/src/i18n/translations.ts` | No. The rule matches `.json`, this is `.ts` | The landing page's real copy file is ungated |
| `orbit-api` `.cs` outside `/Email/` | No | 71 tracked `.cs` files contain a dash |
| Any `.md` | No | `CLAUDE.md`, `DESIGN.md`, `FEATURES.md`, `TESTING.md`, `WORKFLOW.md` all contain them |
| `.tsx` JSX string literals | No | |
| PR bodies, commit messages, Linear tickets | No | Not files at all |
| Whole repo | 268 tracked files in orbit-ui-mobile contain a dash | Many disappear with `.claude/` in Phase 3, not all |

ESLint cannot be the home: it reads JS and TS only, and this rule spans a TS monorepo, a .NET
solution, and an Astro site. **One checker, three thin gates:**

- **`tools/check-dashes.mjs`**, vendored into all three repos. The only place the pattern and its
  exceptions live (en dash allowed inside a numeric range such as `1-10`; lock files and vendored
  content skipped).
- **CI job in all three repos**, diff-scoped. This is the real gate: it holds for Codex, Claude,
  a human, or a bot, and nothing bypasses it.
- **lefthook pre-commit in all three repos**, staged files only, for two-second feedback.
- **CI check on the PR title and body**, because that is where dashes leak most and no
  file-based tool reaches it.

**No ESLint rule and no Roslyn analyzer for this one.** They would duplicate the same pattern in
two more languages for surfaces the script already covers. ESLint was right for `spacing-scale`
because that is genuinely about TS syntax; a dash in prose is not.

`dash-baseline.json` lists the known offenders and is CI-asserted to only shrink, exactly like
`eslint-suppressions.json`. Clearing it becomes part of the mechanical-debt project in Phase 6.

#### 6.1.2 The rule-versus-gate audit: 15 confirmed gaps

Workflow `rule-gate-coverage-audit` (run `wf_d1fea521-97e`), completed 2026-07-23. Extracted **753
stated rules** across the 3 repos and **111 gates**, produced 22 candidate gaps, and adversarially
verified each: **15 confirmed, 5 refuted**. Five are `fix-in-phase-1` and are additions to the
migration table above.

| # | Severity | Gap |
|---|---|---|
| 1 | high | **All five content hooks scan ADDED TEXT ONLY, never the file on disk.** `forbid-em-dashes`, `forbid-ai-cliche-copy`, `forbid-placeholder-content`, `forbid-typed-uppercase`, `forbid-hardcoded-brand-color` all read the PostToolUse payload. So pre-existing violations inside the gated path are permanently invisible, and any file arriving via git checkout, merge, rebase, cherry-pick or codegen is never scanned at all. This is strictly worse than the path-scope gap in 6.1.1. (The finder's specific `.astro` example was refuted on verification; the scope defect itself is confirmed.) |
| 2 | high | **`csharp-tz` covers 2 of 4 API projects.** The rule claims "all user-facing dates"; the gate regex matches only `Orbit.Application` and `Orbit.Domain`. 27 files in `Orbit.Infrastructure` and `Orbit.Api` use `DateTime.UtcNow` ungated, including `HabitDueDateAdvancementService.cs`, `GoalDeadlineNotificationService.cs` and `ProactiveCheckinSchedulerService.cs`, which build `DateOnly` query windows. If the Phase 1 Roslyn analyzer inherits the two-project scope, the blind spot ships forward. |
| 3 | high | **The spacing ratchet has no handle.** 271 suppressed violations, and **zero CI jobs read the suppression files**, so a new violation can be absorbed silently. The `lint:prune` scripts in both `package.json` files are invoked by no workflow. |
| 4 | high | **Six rules `DESIGN.md` presents as gates are `warn` on web and `error` on mobile.** No `--max-warnings=0` anywhere, and CI runs `npx turbo run lint`, so ESLint exits 0 and the same rule blocks on mobile while staying silent on web. |
| 5 | medium | **`parity-nudge` needs 3+ edits in one scope with zero in the twin, within one session.** The rule says "every change". A 1 or 2 file web-only change never fires, and state resets per session. |
| 6-12 | medium | `orbit-landing-page/CLAUDE.md` names two lint rules that do not exist (`local/no-any`, `no-console`; `no-console` is covered by nothing). Three patterns banned in both repos are gated in one. Nothing checks that "Orbit" and "Astra" survive untranslated in `pt-BR.json`. `dep-sweep` routes Expo upgrades to an `upgrading-expo` skill that exists in neither the repo nor the global directory. Neither DTO gate can judge the Play-fleet lag or `MinSupportedVersion` ordering. `core.md` rule 4 (load-bearing strings) has no gate at all, by its own admission. Zero design-system gates exist in the landing repo, and its `global.css` still defines `--gradient-header`, `--primary-glow` and `--primary-glow-hover`, which `DESIGN.md` declares deleted. |
| 13-15 | low | `CLAUDE.md` claims 19 opencode parity assertions; the count drifted by 3. `tools/drive-ab-report.mjs` is documented as backing the `/drive` A/B but is called by nothing. The global `impeccable` skill points at a missing `NOTICE.md`. The first two are resolved by the Phase 3 teardown; the third is Phase 6. |

### 6.2 The ticket template

Every ticket carries: imperative specific title; the problem and why it matters; scope and
explicit out-of-scope; expected behaviour; technical details; affected modules, functions and
files; acceptance criteria; test scenarios; `blockedBy` links; rollout strategy and kill switch
where risk exists; events and metrics; parity, i18n, and contract requirements where applicable.

A checker rejects an incomplete ticket rather than letting a worker guess.

Standing rules on ticket creation: never a separate ticket for tests; migration and schema live
in the same ticket; no "foundation" ticket full of unused functions; every ticket produces one
reviewable PR; tickets over 5 points get split; the dependency graph is explicit, never inferred
from titles.

### 6.3 New skills and agents

| Thing | Job |
|---|---|
| `product-manager` agent | Interrogates the idea, writes executable tickets, knows the parity contract, the append-only DTO rule, and `DESIGN.md` |
| `design-specialist` agent | Shapes the UI half of a ticket against `DESIGN.md` |
| `/feature` (rewritten) | Idea -> Linear project + DAG. No code. |
| `/bug` (new) | One ticket, same format |
| `/orchestrate` (new) | Linear -> waves -> worktrees -> PR babysitting -> next wave |
| `AGENTS.md` (both repos) | Codex's equivalent of `CLAUDE.md` |
| `.claude/orchestrator.json` | `{"worker": "claude" \| "codex" \| "auto"}` |
| `tools/arch-map.mjs` (both repos) | Generates `architecture.json` |
| `architecture.html` | One page, both repos, for human reading |

Before writing `/feature` and `/bug`, read `mattpocock/to-prd`, `mattpocock/to-issues` and
`mattpocock/triage` rather than inventing from scratch.

### 6.4 The architecture map

`architecture.json` per repo, derived and CI-verified, carrying:

1. Routes and screens, with **web to mobile parity pairs**
2. API endpoints -> controller -> handler -> DTO -> the mirroring Zod schema
3. Module dependency edges (from `csharp-lsp` `get_project_graph` for api, the import graph for TS)
4. i18n key ownership per surface
5. Which tests cover which module

`architecture.html` embeds both and is for Thomas. A CI job regenerates the JSON and fails on
drift. This is what replaces `.claude/workorders/` as the thing an agent reads instead of
exploring.

---

## 7. Phases

Ordered. Phase 1 cannot be reordered: running any worker before it ships unguarded code.

| Phase | Contents | Verifiable end state |
|---|---|---|
| **0** | Back up the 562 spec to the vault. Register orbit-api and orbit-landing-page in Orca. Merge the 3 Dependabot PRs. Archive `feature/539-b5-apply-design` as `archive/539-b5-apply-design` and push it, then close #560 unmerged. Cherry-pick `DESIGN.md` + the 4 ESLint rules into a small PR. Remove the 10 dead worktrees under `.claude/worktrees/`. | `git worktree list` shows only the main checkout |
| **1** | The guard migration (6.1) | A table, one row per old hook, with its new home and the test proving it fires |
| **2** | `tools/arch-map.mjs`, `architecture.json`, `architecture.html`, the drift CI job | Thomas opens the HTML and recognises his app. **ui half: PR #579 (2026-07-24)**: 29 web + 52 mobile routes, 25 parity pairs, 157 endpoints, drift gate green in CI. **Finding for Phase 5:** 27 unpaired mobile "routes" are section/atom files sitting directly under `apps/mobile/app/` that expo-router genuinely serves as navigable URLs (`today-sections`, `login-atoms`, ...) - a real defect needing a ticket (move them out of `app/` or underscore-prefix them). Also: 1,482 i18n keys attributable to no route. api half in flight |
| **3** | The deletion (section 5). Rewrite `CLAUDE.md` and `.claude/rules/core.md`. | ~34,000 lines lighter, all CI green. **DONE 2026-07-24**: 32,046 lines deleted across 290 files in the Phase 3 PR (the `.claude/drive/` and specs/plans lines in section 5's estimate were never tracked on `main`); D39 survivors kept; test-hooks trimmed to the surviving hooks + the frontmatter guard, local-only |
| **4** | `AGENTS.md`, `orchestrator.json`, the two agents, `/feature`, `/bug`, `/orchestrate`, the ticket template and checker, and D7/D8/D9 as machinery | A dry-run wave table prints. **DONE 2026-07-24** (PR pending): `tools/wave-plan.mjs` printed a REAL two-wave table against live Linear (smoke tickets ORB-5 blocking ORB-6, then canceled), `tools/check-ticket.mjs` passed a valid body and correctly rejected the live issue for its missing repo label. **Constraint discovered:** the orca CLI can create/edit ISSUES and relations but has NO project-create or label-create; Phase 5 needs the `repo:*`, `parity:*`, `visible-effect`, `attempts:2` labels and the projects (539, 562, Launch, Backlog) to exist first, via either a Linear personal API key (GraphQL, automatable, PREFERRED: Thomas creates the key once at linear.app Settings > Security & access > Personal API keys) or manual UI creation. Ask Thomas at the next checkpoint |
| **5** | Migrate 43 open GitHub issues into Linear as a triage pass (fold, close, rewrite). Re-cut #539 and #562 as Linear projects, including R19-R21, the landing ticket(s) and the D20 assets (8.5.2), with the animation list and claimed-orphan candidates reconciled per D8 into ticket bodies. Extend `redesign-coverage.mjs` with the file-level assertion (D38). | Thomas approves the fold/close table, then sees the wave tables |
| **6** | Generate the mechanical-debt project from the suppression ledgers. Redesign `/prod-readiness` and the 4 `/audit-*` per D10 and D11. Sort every doc per D12. Run the redesigned audit once. Run the skill rewrite pass (section 10). | **DONE 2026-07-24.** The mechanical debt did NOT become its own project: it is drained inside the #539 per-surface tickets that already own those files (D38), with ORB-46 rewritten as the terminal must-equal-zero backstop. Audits redesigned (#588), docs sorted and WORKFLOW.md deleted (#586), 48 skills swept (#590 + api #434). The one item deliberately NOT done is running the redesigned audit once: under D10 an audit's output is Linear tickets, and firing a ~22.8M-token pass to mint tickets nobody will start before Phase 7 is waste. Run it when Phase 7 proves the flow |
| **7** | Run the full flow end to end on one small real ticket while Thomas watches. Then #539 wave 1. Candidate: **ORB-75** (PostHog server SDK), the launchable ticket of the PostHog project. Blocked on two acts only Thomas can perform: a PostHog EU Cloud org and project with the key on Render, and `codex login` on ChatGPT Pro IF the proof should run on the codex engine (otherwise it runs on `claude`, the current `orchestrator.json` default, which needs nothing). | A PR comes out the other side |

**What Thomas watches while a wave runs** (asked and answered 2026-07-24, recorded so it is not
re-derived): the Linear board at `https://linear.app/useorbitai/team/ORB/active`, which is already
a kanban board; In Progress and In Review sit under "Hidden columns" only because they are empty,
and appear when `/orchestrate` moves a ticket. Alongside it, `orca worktree ps` for the live
per-worktree branch, terminal count and output preview, and `gh pr list` for what is waiting on a
human merge. One `/orchestrate <project>` already fans out to `maxParallelWorktrees: 8`; running
three at once is not what it was built for, because the cap is per-run and three runs cannot see
each other.

---

## 8. #539: the whole-app redesign

### 8.1 Why it failed

Section 1.2. In one sentence: it was chasing a negative, judged by a machine that could not see,
across a work unit that was 100x too fine.

### 8.2 The new shape

- **Ticket 0, blocks everything: rewrite `DESIGN.md` against a chosen reference.** Thomas picks
  the direction from the visual reference board (D14). This rewrites the spec, it does not apply
  it. Today's spec is a de-decorated navy-violet look; the new direction will be different, and
  that is a deliberate decision, not drift.
- **Wave 1, 4 tickets, parallel: the system** (`R1` to `R4` in 8.2.1). Overlay and sheet
  primitives, app shell and nav, the habit list row, and motion plus celebrations. Web plus mobile
  in one PR each, screenshots attached. When these land, most of the 171 screens change without
  anyone touching them.
- **Wave 2, 14 tickets: every remaining screen** (`R5` to `R18` in 8.2.1). Not a hand-picked list.
  **Derived from the manifest and CI-asserted**, so no screen can be quietly skipped.
- **Wave 3: the 271 spacing violations**, by area, once the scale is settled. Includes the mobile
  streak parity gap left by PR #574.
- **Wave 0.5, blocking wave 2: the mobile capture path**, because all 348 mobile cells currently
  have no way to be photographed (8.2.2).
- **Three tickets the manifest could not see** (D38, from the 8.5 register): `R19-copy-voice`,
  `R20-comms` (orbit-api, targets `main` per D37), `R21-widget`. Plus the landing-page redesign
  in its own repo.
- **Parallel project: local-first feel** (D19) and **brand assets** (D20).

Every one of the 12 human-found defects becomes a ticket carrying the root cause already
identified in `.claude/specs/issue-539-user-found-defects.md`.

`archive/539-b5-apply-design` is referenced by each surface ticket as *a prior attempt: read it,
keep what is correct, redo what is not, do not assume it is right.*

### 8.2.1 The 18-ticket partition, covering 171 of 171 surfaces

Derived, not chosen. `tools/redesign-coverage.mjs` (committed 2026-07-23) holds the ordered rule
list, assigns every surface to the first matching ticket, and **exits 1 if anything is unclaimed**.
Run it after any manifest regeneration.

| Ticket | Surfaces | Covers |
|---|---|---|
| `R1-primitive-overlay` | 14 | Overlay, sheet, dialog, popover, menu, picker primitives |
| `R2-primitive-shell` | 5 | App shell, page header, rail, tab bar, filter pills, command palette |
| `R3-primitive-row` | 5 | Habit list row, trailing controls, bulk action bar |
| `R4-motion-celebration` | 10 | Celebrations, toasts, level-up, fresh start, streak animation |
| `R5-screen-today` | 7 | The four root views plus mobile equivalents |
| `R6-screen-goals` | 9 | Goals view, card, create, edit, detail |
| `R7-screen-habits-crud` | 9 | Habit create, edit, detail, emoji, description, reschedule |
| `R8-screen-calendar` | 10 | Calendar and calendar sync |
| `R9-screen-streak` | 4 | Streak page, sections, freeze |
| `R10-screen-achievements` | 3 | Achievements |
| `R11-screen-astra` | 5 | Astra chat and AI settings |
| `R12-screen-insights` | 13 | Insights, retrospective, wrapped |
| `R13-screen-social` | 22 | Social, challenges, friends, pairs, public profile |
| `R14-screen-onboarding` | 9 | Onboarding, tour, feature guide |
| `R15-screen-auth` | 8 | Login, auth callback, email and code steps |
| `R16-screen-settings` | 18 | Preferences, advanced, profile, account, notifications, API keys |
| `R17-screen-monetization` | 12 | Upgrade, trial expired, referral, share, marketing consent |
| `R18-screen-static` | 8 | About, privacy, terms, support |
| **Total** | **171** | **0 unclaimed** |

Six surfaces match two rules and resolve first-rule-wins (public profile to social over settings;
streak celebrations to motion over the streak screen). Deterministic, recorded, not ambiguous.

Wave order: ticket 0, then R1 to R4 (the system, which changes most screens without touching them),
then R5 to R18 in parallel.

### 8.2.2 Two prerequisites this partition exposed

1. **Mobile has no capture path at all.** All 348 mobile cells carry `pixelEvidence: none`. Web has
   one (`tools/capture-surfaces.mjs` plus the hermetic mock API at
   `apps/web/e2e/visual/mock-api/server.ts`, which renders authed screens locally with no
   credentials and no production data). Building the mobile equivalent is the **wave 0.5 ticket of
   the #539 project** (8.2), created in Phase 5 and built before wave 2: without it, "we
   redesigned the whole app" is unverifiable for 72 surfaces. (An earlier draft called this a
   "Phase 1 prerequisite", contradicting 8.2's wave-0.5 placement; resolved 2026-07-24 - Phase 1
   blocks because of GUARDS, and this is not a guard, it is the redesign's evidence mechanism.)

   **Mechanism researched and chosen 2026-07-24** (live-verified sources): **Maestro driving an
   Android emulator**, `takeScreenshot` + `openLink` deep links into expo-router, theme and locale
   flipped via app-level query params (never OS-level mutation, which needs zygote restarts).
   Windows-native locally; CI via `reactivecircus/android-emulator-runner` on KVM runners.
   **Known risk to engineer around:** Maestro's built-in flakiness tolerance is anti-deterministic
   for pixel evidence; every capture needs an explicit `waitForAnimationToEnd`, and the harness
   build pins animation durations off. **Fallback:** plain `adb exec-out screencap` + `am start`
   deep links (same emulator substrate, no framework waits). **Rejected:** react-native-owl (last
   release 2025-01, New-Arch support unverified); Storybook RN (no native capture of its own, a
   second inventory to drift); react-native-web capture as EVIDENCE (disqualifying fidelity:
   TrueSheet's web target silently falls back to `@gorhom/bottom-sheet`, the exact library this
   repo banned for no-opping, and native transitions do not exist in DOM), usable at most as a
   layout pre-check.
2. **Motion is not in the manifest.** `R4-motion-celebration` covers the 10 celebration *surfaces*,
   but the check animation, sheet transitions, page transitions and skeletons are not counted
   anywhere. **Resolved 2026-07-24:** the denominator audit produced the list, 69 distinct
   user-visible animation behaviours, 0 of which the manifest can see. The full enumeration is in
   `brain/2 Areas/20-29 Orbit Engineering/denominator-audit-2026-07-24 (raw, #539).json`; Phase 5 distributes each item to its owning
   ticket body (celebrations to R4, screen-specific to the screen ticket, cross-cutting route
   transitions, skeletons, press feedback and focus rings to R1/R2, landing motion to the landing
   ticket).

### 8.3 What `DESIGN.md` is missing

Today it has one real mechanical rule, the enumerated spacing scale, gated by
`local/spacing-scale`. Everything else is prose adjectives. Each of these must be added and made
enforceable:

| Spec | Must state |
|---|---|
| Type scale | Every size, weight, line-height, letter-spacing, named by role |
| Density | Exact row heights per list type. The single biggest visual gap versus good habit trackers |
| Colour roles | A table: this colour, this meaning, these are the only places it may appear |
| Border vs shadow vs fill | One rule for how surfaces separate |
| Radius scale | Enumerated, like spacing |
| When a card is allowed | Cards group; they are not per-item wrappers. This is what stops eight identical boxes |
| Icon spec | Stroke width, size, optical alignment |

### 8.4 The diagnosis of the current UI

From the two reference screenshots compared on 2026-07-23. Orbit has near-zero contrast on four
axes: **type contrast** (one sans at two sizes), **temperature** (cool neutral, no warmth),
**density** (90px cards with 16px gaps; a good reference fits three times as much), and
**meaning-bearing colour** (purple appears on the ring, the active nav item and the CTA, and says
nothing about the data). Every habit sits in its own bordered card, so eight identical rectangles
stack up and nothing draws the eye. The right rail is one ring, four rows, then a third of the
screen empty.

The reference that has "the thing" carries: a serif display face, a warm palette, texture,
colour that encodes meaning per item, compact rows grouped under small pill labels instead of
per-row cards, and glyph runs that encode properties in one compact line.

**Linear was tried and came out bland** because Linear's restraint sits on top of enormous
typographic and density discipline. Copying the restraint without the discipline removes what
little was there. This is why D14 exists.

---

### 8.4.1 The named defects in the current UI, from two screenshots (2026-07-23)

Thomas: "this doesn't feel premium, I don't know how to explain it." Named mechanically, ranked by
damage. Every one is a missing rule, not a taste failure, so every one is ticket-0 work.

1. **Decorative icon chips.** Four rounded-square accent-tinted containers, one per stat row,
   wrapping four line icons and carrying zero information. The card-per-item disease at icon scale.
2. **The accent does six jobs on one screen**: ring, four chips, progress bar, active filter pill,
   Astra glyph, logo. When everything is the accent, nothing is.
3. **Three icon art directions inside 40 vertical pixels**: Tabler line icons in rows, a full-colour
   fire emoji in the header, a 3D planet emoji as the logo.
4. **Four radii with no scale**: circles (header buttons), pills (filters), ~12px (chips), full
   circle (ring). Nothing states which to use when.
5. **Row rhythm breaks on a variant.** The level row is two lines because a progress bar lives
   inside it while its three siblings are one line, so its value stops sharing their baseline. Row
   height is not a spec.
6. **Space allocation inverted.** The ring spends about 450px to render one number, then a third of
   the panel is empty.
7. **`TUDO FEITO` is the only uppercase letterspaced text on screen**, a recognised slop tell, and
   label and value share size and weight so there is no type contrast.

### 8.5 The denominator problem: the manifest is ONE of at least six

**The 171-surface manifest covers screens and nothing else.** Confirmed 2026-07-23. Everything below
is user-facing and structurally invisible to it, which means a redesign driven only by the manifest
would ship with all of it untouched:

| Denominator | Status |
|---|---|
| Screens, views, modals, sheets | Have it: 171, all claimed, CI-asserted |
| Component files no surface closure reaches | No count |
| Copy and i18n keys (the AI-slop axis) | **No denominator at all** |
| Animations and transitions | **No denominator at all** |
| Transactional emails, push notification copy (`orbit-api`) | Outside the manifest |
| The Android widget (`apps/mobile/modules/orbit-widget`) | Outside the manifest |
| `orbit-landing-page` in full | Different repo, outside the manifest |
| `DESIGN.md` properties specified in prose only, where a redesign can drift while gates stay green | Unmeasured |

### 8.5.1 The measured register (audit `wf_f92a2a55-14d`, landed 2026-07-24)

7 counting agents, each claim adversarially verified by independent skeptics (a sample of 10-12
per denominator; Haiku verifiers). 89 agents, 0 errors, 4.4M tokens. Raw output:
`brain/2 Areas/20-29 Orbit Engineering/denominator-audit-2026-07-24 (raw, #539).json`.

| Denominator | Total | In manifest | Claimed uncovered | Verified sample: confirmed / refuted |
|---|---|---|---|---|
| Web `.tsx` files (`app/` + `components/`) | 356 | 316 | 40 | 4 / 8 |
| Mobile `.tsx` files | 297 | 261 | 39 | 3 / 9 |
| i18n string keys (parity perfect, 2,905 = 2,905) | 2,905 | n/a | 10 problem strings | 5 / 5 |
| Animations and transitions | 69 | **0** | 69 | 6 / 6 |
| Non-screen surfaces (emails, push, widget, errors, assets) | 166 | **0** | 166 | 9 / 3 |
| orbit-landing-page (pages, components, strings, assets) | 274 | **0** | 274 | 11 / 1 |
| DESIGN.md prose-only visual properties | ~70 of 135 | **0** | 62 | 3 / 9 |

**How to read the numbers honestly.** Verification was sampled, so "claimed minus verified" is
unverified, not confirmed; and the refutation rate on the sampled items is ~40%, so every claimed
list is treated as **candidates**, reconciled per D8 when the Phase 5 ticket bodies are written.
Two caveats cut the other way: several refutations on the DESIGN.md-prose denominator leaned on
`tools/judge-surfaces.mjs` and the design-reviewer flow, machinery Phase 3 deletes, so those
refutations dissolve with it; and the three whole-category zeros (animations, non-screen,
landing) are structural facts about what the manifest indexes, not sampled claims.

**Confirmed highlights, by consequence:**

- **Zero of 69 animations are indexed anywhere.** The confirmed six are the entire celebration
  set (streak, all-done, level-up, achievement toast, welcome-back, streak-freeze), the exact
  moments D19 calls the premium payoff.
- **The full transactional email stack is invisible**: all templates plus `Layout.html` plus
  `EmailCopy.cs` (EN + PT-BR). A user's first Orbit artifact after signup is an email no redesign
  ticket owned.
- **138 user-facing error message constants** (`ErrorMessages.cs`) plus the 3 AI push-copy
  generators (temperature 0.7-0.9, the highest slop risk in the register) had no owner.
- **The landing repo actively violates the design freeze**: `Hero`, `AppMockup`, `IosWaitlist`,
  `PillButton`, `waitlist-confirmed` still consume the deleted `--gradient-header` /
  `--primary-glow` tokens (also gap 12 in 6.1.2).
- **10 slop strings in shared i18n**: 4 hints carrying banned dashes, 6 exclamation-heavy
  celebration lines ("Amazing milestone!", "Triple digits! Legendary!") that read as filler
  against the rest of the voice.
- **The manifest photographs 2 of the 8 mandated component states** (default, empty). Loading
  and error are confirmed absent for every form and data surface.
- **Confirmed orphan files**: web chat components (typing indicator, goal/habit cards, pending
  operation), mobile root `_layout.tsx`, `+not-found.tsx`, `tag-chip.tsx`.

### 8.5.2 Disposition: every row gets an owner (D38)

| Register row | Owner |
|---|---|
| Orphan component files (web + mobile) | Assigned by directory rule to existing tickets (chat to R11, upgrade to R17, habit form fields to R7, goals to R6, gamification to R4, ui primitives to R1, layouts and not-found to R2). `redesign-coverage.mjs` grows the file-level assertion in Phase 5 |
| i18n copy, all 2,905 keys | **New ticket `R19-copy-voice`**: one whole-app voice pass against ticket 0's voice section; kills the 10 confirmed strings; the 6.1.1 dash gate holds it afterwards |
| Emails, AI push copy, error messages | **New ticket `R20-comms`** (orbit-api, targets `main` per D37): templates, `EmailCopy.cs`, the 3 AI generator prompts and fallbacks, `ErrorMessages.cs` |
| Android widget | **New ticket `R21-widget`**: layout XML, item XML, strings, picker metadata |
| Landing page (274 units) | Landing-repo redesign ticket(s), including deleting the 3 banned glow/gradient tokens; same-day switch via its own `redesign/main` (D40) |
| Animations (69) | Distributed to owning ticket bodies in Phase 5 (see 8.2.2 item 2) |
| Brand assets (11 app icons, 2 OG images, splash, notification icon) | The D20 project, unchanged |
| Component states (8 per component) | Per-ticket acceptance criteria under D7; ticket 0 must spec all 8 states per primitive |
| DESIGN.md prose-only properties | Ticket 0 converts each into either a mechanical spec (8.3) or an explicit reviewer-checklist line in the ticket template; nothing stays adjective-only |

## 9. #562 (Astra epic): the conversion

The 187-line gitignored spec becomes a Linear project. The mapping:

| Today | Becomes |
|---|---|
| The "locked decisions, do NOT re-litigate" block | The **Linear project overview content**, which `/orchestrate` reads first and honours verbatim, every wave (the 255-char description holds only a pointer) |
| The 10-bundle table | 12 to 14 tickets (bundles 4 and 7 split across repos) |
| "Sequence B2 after B1" | `blockedBy` from api#410 to api#407 |
| "Run B10 last as the pre-launch gate" | ui#537 blocked by every other ticket |
| The standing constraints | Already in `CLAUDE.md` and `AGENTS.md` |

All 14 referenced issues are OPEN as of 2026-07-23: api#407, #409, #410, #411, #412, #413, #420,
#421, #422; ui#517, #521, #537, #538; and ui#562 itself.

Reading the dependencies, only api#410, ui#517 and ui#537 have real blockers. **About 8 tickets
are wave 1.** `/drive` ran them one at a time.

---

## 10. Skills

### 10.1 The ui-skills registry

185 skills, parsed from `ibelick/ui-skills` `src/data/registry.ts`. Note: `npx ui-skills list`
returns only 110; the registry file is authoritative. Install the router only (D16); everything
else is named in a ticket body and fetched with `npx ui-skills get <name>`, which works for both
Claude and Codex.

**Direction (ticket 0 only, read once):** `emilkowalski/apple-design` (top pick: fluid physical
motion, springs, sheets, translucent materials, optical typography, and a philosophy that fits a
daily tactile ritual far better than Linear's), `MengTo/stitch-design-taste` (combine several
references into one coherent direction, which is literally the ticket-0 job),
`Leonxlnx/soft-skill`, `Leonxlnx/minimalist-skill`, `MengTo/high-end-visual-design`,
`Leonxlnx/brutalist-skill`, `zeke/swiss-design`, `anthropics/canvas-design`.

**Writing `DESIGN.md`:** `jakubkrehel/better-typography` (the best mechanical fit in the whole
registry: type scale, variable fonts, tabular numbers, measure, truncation),
`jakubkrehel/better-colors` and `jakubkrehel/oklch-skill`, `MengTo/container-lines` (borders and
containers as a system, which is the fix for the eight-identical-cards problem),
`MengTo/beautiful-shadows`, `ibelick/create-design-md`, `pbakaus/typeset`.

**Audit, which produces tickets (D10):** `ibelick/improve-ui`,
`emilkowalski/improve-animations`, `millionco/improve-react`, `shadcn/improve`,
`Leonxlnx/redesign-skill`, `MengTo/redesign-existing-projects`. All are read-only planners that
write self-contained implementation plans for another agent, which is exactly the new
architecture. They run **after** ticket 0, never before it.

**Execution:** `anthropics/frontend-design`, `MengTo/design-taste-frontend`,
`jakubkrehel/better-ui`, `emilkowalski/emil-design-eng`,
`jakubkrehel/make-interfaces-feel-better`, `Dammyjay93/interface-design`, `MengTo/image-to-code`,
`shadcn-ui/shadcn`, `MengTo/tailwindcss`, `PrototyperAI/build-primitive` (real ARIA, keyboard and
focus for wave 1's primitives).

**Motion:** `emilkowalski/animation-vocabulary`, `emilkowalski/review-animations`,
`raphaelsalaja/mastering-animate-presence` (maps onto the existing `animate-presence-*` ESLint
rules), `raphaelsalaja/to-spring-or-not-to-spring`,
`raphaelsalaja/12-principles-of-animation`, `iart-ai/micro-interaction`,
`iart-ai/60fps-animation`, `iart-ai/accessible-animation`,
`iart-ai/page-transition-animation`, `ibelick/fixing-motion-performance`,
`MengTo/animation-systems`, `Jakubantalik/transitions-dev`.

**Gates and QA:** `vercel-labs/web-design-guidelines`, `millionco/react-doctor` (already in CI),
`ibelick/fixing-accessibility`, `wshobson/wcag-audit-patterns`, `rams/rams`,
`microsoft/playwright-cli` and `vercel-labs/agent-browser` (evidence-gate screenshots).

**Stack:** `vercel-labs/next-best-practices`, `next-cache-components`, `react-best-practices`,
`callstackincubator/react-native-best-practices` (installed), `antfu/turborepo`.

**Workflow rebuild:** `mattpocock/to-prd`, `to-issues`, `triage`, `codebase-design`,
`improve-codebase-architecture`, `diagnosing-bugs`, `grill-with-docs`. Note that
`cursor/thermo-nuclear-code-quality-review` in the registry is the origin of the local skill of
the same name.

**Feel, not looks:** `brotzky/linear-local-first-architecture` and
`brotzky/conductor-rewrite-performance` (D19).

**Rejected:** `nextlevelbuilder/ui-ux-pro-max` (50+ styles and 97 palettes is the average of
everything). `Leonxlnx/output-skill` and `MengTo/full-output-enforcement` (already covered by
`CLAUDE.md`). `ayghri/i-have-adhd` (already installed). All Vue, Nuxt, Three.js, SwiftUI, Svelte,
GSAP, video, slides and poster skills (~125 of the 185) as out-of-stack.

Note: `pbakaus/impeccable` is already installed globally and **bundles the entire pbakaus verb
family** as `reference/*.md` (bolder, colorize, typeset, layout, polish, distill, harden,
critique, delight, overdrive, quieter, adapt, animate, clarify, optimize, shape). Do not install
those separately.

### 10.2 The skill rewrite pass (Phase 6)

Inventory: 33 skills in orbit-ui-mobile, 2 in orbit-api (`pr-review`, `second-opinion`), 0 in
orbit-landing-page, 23 global. After Phase 3 deletes 12 and Phase 4 adds 3, the **survivors plus
new** are what get swept (D21).

Per skill, one sub-agent, parallel up to the concurrency cap:

1. Run `writing-great-skills` against it: invocation cost, information hierarchy, disclosure
   opportunities, duplication, sediment, negation, no-ops, leading-word usage.
2. Produce a rewritten version applying **only** changes that improve predictability, reduce
   context or cognitive load, or remove duplication and sediment. Never changes that alter what
   the skill does, its triggers, its completion criteria, or its output contract.
3. Separately flag anything even mildly suspicious. Do not apply it.
4. Include the diff.

Application: global skills written straight to disk; repo skills bundled into one PR per repo on
`chore/skills-cleanup`, described skill by skill. One consolidated report of every flagged,
unapplied change, grouped by skill, for individual approval. **Nothing flagged is applied without
an explicit yes.** Do not touch anything outside `.claude/skills/` even if a problem is noticed
there; note it and move on.

---

## 11. Thomas's manual steps

Everything not on this list is Claude's.

### ALL DONE as of 2026-07-23. Nothing is waiting on Thomas.

- [x] PR #574 merged (cleared 4 of the 271 spacing violations on the web streak page)
- [x] `/tui fullscreen` enabled
- [x] Approved: close #560, delete the harness, run the skill sweep after deletion
- [x] Decided: #575 closed, #573/#572/#567 merged by Claude
- [x] **Linear account created.** Workspace `useorbitai`, team `Orbit`, key `ORB`, free tier.
      Registered on `contact@useorbit.org` under Thomas's real name (the GitHub link is a separate
      per-user "Connected accounts" step, so the personal `thomasluizon` account attaches fine).
- [x] **Linear connected to Orca.** Verified: `orca linear team list --json` returns team `ORB`,
      id `99996489-8aad-4e01-a8f9-6123adfb7d6b`, workspace `940a4273-8e9f-4f75-ba2f-33b8d2a45759`.
- [x] **Design direction chosen:** dense and warm (D28).

The steps below are kept only as the record of what was done.

### 1. Create the Linear account

1. Go to `linear.app`, click Sign up, use `contact@useorbit.org`.
2. Workspace name: `Orbit`
3. First team: name `Orbit`, key `ORB`. Tickets become ORB-1, ORB-2, and so on.
4. Skip any "invite teammates" screen.
5. **Do not pay.** Free gives 250 open tickets and 2 teams; the need is about 60.
6. If it offers to connect GitHub, accept, and select **only** `orbit-ui-mobile` and `orbit-api`.
   Not the landing page.
7. Paste the workspace URL into the session.

### 2. Connect Linear to Orca

1. Open the Orca app.
2. Settings -> Integrations (or Connections) -> Linear -> Connect -> Allow.
3. Type `linear connected`.
4. **If it is not found within two minutes, stop and say `cannot find linear in orca`.** Claude
   drives the Orca window instead. Do not go hunting.

### 3. Set the session model

1. `/model` -> **Opus 5**
2. `/effort` -> **High**. If the command does not exist, say so.
3. This is the only model setting ever touched. Workers get theirs from
   `.claude/orchestrator.json`.

### 4. Say `go`

### Later, when Codex is bought

1. Buy the ChatGPT plan, run `codex login`, follow the browser prompt, then type `codex on`. One
   word changes in one file and every subsequent ticket runs on Codex.
2. Connect GitHub in Codex and turn on **Automatic reviews** at
   `chatgpt.com/codex/settings/code-review`, for `orbit-ui-mobile` and `orbit-api` only. No API
   key, no secret. Claude writes the `## Code Review Rules` sections that steer it (D26, D27).

### Never

Do not run `/drive 562` or `/drive 539` (D23).

---

## 11.1 The visual reference board (DONE, direction chosen)

Built and delivered 2026-07-23. 19 of 20 candidates captured with Playwright at 1280px, plus Orbit's
own landing and app as row 0, assembled into a grouped scrollable page. Thomas chose **dense and
warm** (D28). Height was dropped: `height.app` resets the connection from both Playwright and
WebFetch, the product appears to be gone, and Linear plus Raycast already covered that direction.

Working files (scratchpad, rebuildable): `board/capture.mjs`, `entries.mjs`, `build.mjs`,
`board.html`, `shots/`. Two capture lessons worth keeping: `orca screenshot` kills the Orca runtime
connection (reproduced twice while `orca status` reported ready, worth reporting to Orca), and
Playwright's headless Chromium is 403'd by some marketing sites where `channel: "chrome"` succeeds.

### 11.1 (historical) The candidate list

Deliverable: one scrollable HTML page. Per entry: a screenshot, the name, a link, and two lines
on what it is doing that Orbit could steal. Grouped by direction so Thomas compares philosophies,
not just pictures. Chosen for having a point of view, not for being popular.

**Capture path:** `orca screenshot` kills the Orca runtime connection (reproduced twice while
`orca status` reported ready; worth reporting to Orca). Use `mcp__claude-in-chrome__*` instead;
verified working on flighty.com.

| Direction | Candidates |
|---|---|
| Warm editorial (the Levla direction) | Day One, Stoic, Bear, Gentler Streak, Levla |
| Dense technical (the control; already rejected as bland for Orbit) | Linear, Raycast, Height |
| Craft minimal (highest discipline tier) | Things 3, Structured, Streaks, Notion Calendar |
| Distinctive brand-forward, dark and warm | Copilot Money, Opal, Flighty (captured), Retro |
| Playful and game-like | Finch, Duolingo, Arc |

Alongside the screenshots, present the stances of the direction skills named in section 10.1
(`emilkowalski/apple-design`, `MengTo/stitch-design-taste`, `Leonxlnx/soft-skill`,
`Leonxlnx/minimalist-skill`, `MengTo/high-end-visual-design`, plus `Leonxlnx/brutalist-skill` and
`zeke/swiss-design` as the far end of the range) so the comparison is between philosophies.

Output feeds #539 ticket 0 (section 8.2). This is the only genuine blocker for that ticket.

## 12. Open, not yet decided

1. ~~The visual direction.~~ **Decided 2026-07-23: dense and warm (D28).** Board delivered, Height
   dropped. ~~The remaining input to ticket 0 is the denominator audit in 8.5.~~ **Landed
   2026-07-24 (8.5.1).** Ticket 0 has no remaining blockers.
2. ~~CodeRabbit.~~ **Decided 2026-07-23: rejected (D24).** No CI reviewer is added at all (D25).
   The cross-model second opinion runs locally inside the orchestrator on the Codex CLI
   subscription (D26). Nothing here needs an API key or a stored credential.
3. ~~Whether `FEATURES.md`, `TESTING.md`, `WORKFLOW.md`, the 4 playbooks and the 3 rules files
   are generated, kept small, or deleted.~~ **Decided 2026-07-24 under D12 (PR #586).**
   `WORKFLOW.md` deleted, its `/drive` instructions being actively wrong after Phase 3.
   `FEATURES.md` kept as hand-maintained, because the Free/Trial/Pro/Yearly gating it carries is
   not derivable from the arch map; the `/pr-review` feature-inventory check (rubric 14) keeps it
   honest. `TESTING.md` kept small. The playbooks and rules files kept, and the tier grew a fifth
   playbook, `context-engineering.md` (D42, PR #592).

**Nothing in this section is open.** Every remaining unknown is empirical and belongs to Phase 7.

---

## 13. The Phase 5 triage table (drafted 2026-07-24, needs Thomas's approval before execution)

All 45 open issues measured live via `gh issue list` on 2026-07-24. Disposition legend:
**Linear** = re-cut as a Linear ticket/project then close the GitHub issue with a pointer;
**GitHub** = stays (D1: GitHub holds landing, infra chores, Dependabot); **close** = superseded.

### orbit-ui-mobile (30)

| # | Disposition |
|---|---|
| 571 TBT budget flaky | Linear (infra-quality ticket; the perf gate must stop crying wolf) |
| 563 988 spacing suppressions to zero | Linear, INTO the Phase 6 mechanical-debt project (it IS that project's seed) |
| 562 Astra epic | Linear **project** per section 9; close pointing to it |
| 561 visual oracle: mobile capture + reviewed baseline | Linear, folded into the #539 project's wave 0.5 ticket; close pointing to it |
| 553 mobile boot perf device session | Linear (post-launch backlog) |
| 552 record demo clips + videos | Linear (launch project; the only human-only ticket) |
| 549 install attribution | Linear (post-launch backlog) |
| 540 auto-updated architecture diagram | **Close when the Phase 2 arch-map PR merges**: architecture.json + architecture.html + drift CI IS this issue, done properly (generated, not hand-drawn Mermaid) |
| 539 design restraint pass | Linear **project** (ticket 0 + R1-R21 + landing + assets per 8.2/8.5); close pointing to it |
| 538 feature flags / kill-switch | Linear (#562 project, B9) |
| 537 eval harness | Linear (#562 project, B10, the pre-launch gate) |
| 530 Sentry triage | Linear (launch project, phase:1, high) |
| 529 technical audit epic | Linear: extract its still-live Now items into tickets during triage, then close; the epic FORM dies with D10 (audits emit tickets, not epics-with-reports) |
| 528 Wrapped consumer | Linear, paired with api#415 (api blocks ui, D4) |
| 527 refer-a-friend v2 | Linear, paired with api#414 |
| 526 ADHD/parity cleanups | Linear |
| 525 voice express-capture | Linear |
| 524 just-one focus + overdue denominator | Linear |
| 523 merchandise annual | Linear (launch gate, phase:2) |
| 522 unmask onboarding checklist | Linear (launch gate, phase:2) |
| 521 clamp Astra messages | Linear (#562 project, B7) |
| 520 streak-freeze celebration | Linear (launch gate, phase:2) |
| 519 10-habit limit upsell | Linear (launch gate, phase:2) |
| 517 QA sweep 4-in-1 | Linear: SPLIT per D4 (Astra grounding slice into #562 B4; the Today-search and create-500 bugs as their own tickets) |
| 395 launch runbook pointer | **Close**: it is a pointer to brain LAUNCH.md, which owns the runbook; a pointer issue is a stale artifact by design |
| 387 DMARC tighten | **GitHub** (infra chore, D1) |
| 379 launch umbrella | Linear **project** "Launch" (absorbs 530, 552, 161, 523/522/520/519 as members) |
| 161 Play listing LTDA address | Linear (launch project; blocked by Gate 0) |

### orbit-api (13)

| # | Disposition |
|---|---|
| 407, 409, 410, 411, 412, 413, 420, 421, 422 | Linear (#562 project tickets, exactly the section 9 bundle map) |
| 417 email-partition rate limiting (mail-bomb) | Linear, **high, launch project** (security bug; NOT in the #562 spec, do not lose it) |
| 415 Wrapped backend | Linear, blocks ui#528 |
| 414 refer-a-friend backend | Linear, blocks ui#527 |
| 319 durable queue at 2+ instances | **GitHub** (infra chore, conditional on scaling) |

### orbit-landing-page (2)

| # | Disposition |
|---|---|
| 43 flagship landing redesign | **GitHub** (D1) but referenced by the #539 Linear project overview content and executed on the landing `redesign/main` per D40 |
| 42 ADHD ASO experiment | **GitHub** (marketing experiment, post-launch) |

Net: ~26 Linear tickets from migration + the ~24 redesign tickets from 8.2/8.5 + #562's ~12, well
under the 250 free-tier cap.

---

## 13.1 The board is populated but only PostHog is startable (measured 2026-07-24)

Counted live via GraphQL, because `orca linear list-issues` pages at 50 and silently returned 50
of 78. Never take a raw count from that command.

| State | Count |
|---|---|
| Backlog | 68 |
| Todo | 8 |
| Canceled | 2 (the ORB-5 / ORB-6 smoke tickets) |
| **Total** | **78** |

| Project | Total | In Todo |
|---|---|---|
| 539 Redesign | 26 | **0** |
| 562 Astra | 17 | **0** |
| Backlog | 12 | 0 |
| Launch | 11 | **0** |
| PostHog | 8 | 8 |
| Brand Assets | 2 | **0** |

**Backlog does NOT block a wave, and nothing needs promoting by hand.** `tools/wave-plan.mjs`
computes launchability from the DAG, not from the board column: a ticket is launchable when every
`blockedBy` is done, its state type is not `started`, and `attempts < 2`. Verified by running it:

```
$ node tools/wave-plan.mjs --project "539 Redesign"
WAVE 1
  ORB-30  [Backlog]  Rewrite DESIGN.md as the dense and warm mechanical spec (ticket 0)
WAVE 2
  ORB-32, ORB-34, ORB-36, ORB-38, ORB-41, ORB-68, ORB-69, ORB-70, ORB-71   blockedBy: ORB-30
```

So the day-to-day is `/orchestrate "<project>"` and nothing else. Todo versus Backlog is a human
reading aid; the orchestrator moves a ticket to In Progress itself when it launches it.

**The one real defect this exposed:** `.claude/orchestrator.json` carries `states.ready: ["Todo"]`
and **no code reads it**. `wave-plan.mjs` never loads `config.states`. Dead config that states a
rule the engine does not implement is worse than no config, because it is read as authoritative:
it produced exactly one wrong conclusion in this document before being caught. Removed. The
sibling `working` / `review` / `done` values stay, because the `/orchestrate` skill uses them for
`orca linear status set`.

## 14. Open follow-ups carried out of Phase 6

Real work found while finishing Phase 6, none of it blocking Phase 7. Recorded here rather than in
a side file: a handoff doc under `.claude/specs/` is untracked by default and section 5 deletes
that directory anyway, which is how `issue-562.spec.md` ended up local-only and at risk (4.2).

1. **`orbit-api` needs `tools/check-frontmatter.mjs` vendored**, as orbit-ui-mobile has it. Its
   own `security-reviewer` copy is fixed, but nothing stops a recurrence there. The bug: an
   unquoted YAML frontmatter value containing `": "` drops the skill or agent silently, which
   disabled 5 skills and the `security-reviewer` agent (so `/pr-review` ran with no security pass)
   before it was caught 2026-07-24.
2. **`orbit-api/.github/workflows/claude-review.yml` cites stale phase numbers.** It tells CI to
   skip "Phase 6 (dotnet build / test)" and "Phase 7 posting", but validate is Phase 7 and posting
   is Phase 8. Followed literally, CI skips the adversarial verification pass and runs the
   validation it was told to skip.
3. **`rubric.md` dimension 8 is stale against the post-#539 `DESIGN.md` in BOTH repos.** It still
   sanctions the gradient header and asks for "violet-glow character", both deleted by the freeze.
   The api copy's preamble also claims `/audit-code-quality` shares it and "there is no second
   copy"; neither is true in that repo.
4. **The skill sweep's flagged-not-applied list**, one report per batch in the session scratchpad,
   holds every proposal withheld because it touched a trigger, a completion criterion, or an
   output contract. The ones with consequences: `_shared/verification-protocol.md` still speaks
   the pre-D10 vocabulary of a "report" and is upstream of all five audit skills;
   `audit-performance/SKILL.md` doubles as its own finders' checklist (`audit.mjs:104`) so its
   prose cannot be disclosed out of the file and every edit mutates the finder prompt;
   `audit-security`'s headless fallback uses `Explore` where the primary path uses
   `audit-readonly`, a wider tool surface; `.claude/audits/prod-readiness-both.md` still exists on
   disk while three D10-rewritten skills promise nothing is persisted there; and `llm-council` and
   `deep-research` both cite a "3-concurrent subagent cap" that exists in no rules file.
5. **`.tmp_users.txt` at the repo root** is the original 3,830-line planning transcript that
   produced this document. Untracked and NOT gitignored, so it can be committed by accident.
   Thomas has been asked whether to archive it to the vault; unanswered.
6. **A `/doctor` pass on 2026-07-24 removed a Stop hook** (`brain/scripts/session-capture.ps1`)
   that spawned a nested `claude -p` and timed out on 131 of 135 runs, about 2h16m of blocked
   time in one day. Settings backup at `~/.claude/settings.json.bak-doctor`. If brain session
   capture is wanted back it has to be non-blocking; it could never finish inside the 60s timeout.
   The same pass found this repo runs `core.hooksPath` redirected to `C:\orbit\.git\hooks`, so
   lefthook reports "Skipping hook sync" and its pre-push guard never installs here. Server-side
   branch protection is the real gate on `main`; the local guard is not protection in this repo.
