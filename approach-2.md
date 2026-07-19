# Approach 2: what to do with the AI-dev harness

Research session, 2026-07-19. Question asked: **keep the custom harness, prune it hard, or delete
most of it and adopt a standardized off-the-shelf approach?**

Method: 5 parallel web-research agents against primary sources, 3 independent council lenses,
2 adversarial advocates arguing opposite maximalist positions, plus first-hand verification of
every load-bearing claim about this repo. No production code or harness file was modified.

Every claim below is labelled. **VERIFIED** means I ran the command myself this session.
**SOURCED** means a live primary URL was fetched. **INFERENCE** means reasoning, not measurement.

---

## 0. Read this first: the harness changed while this analysis ran

**VERIFIED.** Partway through this session, `git status` showed uncommitted modifications to
`.claude/hooks/surface-coverage-gate.mjs`, `tools/check-surface-coverage.mjs`,
`tools/judge-surfaces.mjs`, `tools/surface-manifest.mjs`, and `.claude/manifests/surfaces.json`,
plus four new untracked files (`tools/visual-signature.mjs`, `tools/calibrate-judge.mjs`,
`.claude/manifests/signoff.json`, and two session-scan scripts). The manifest grew from 55,179
bytes to 395,595 bytes.

A different session rebuilt the visual completion gate while this session was analysing it. This
is `fix-problem.md` section 0 happening again, live, during the very session convened to work out
why it keeps happening. **Concurrent sessions editing shared harness files is the top operational
risk in this repo and no mechanism currently detects it.**

It also means the rebuild is the single most important input to the conclusion, because the
rebuilt gate independently implements most of what this research was about to recommend. Details
in section 8.

---

## 1. The premise, corrected

**VERIFIED by measurement.** The "25,000 lines of harness" figure is inflated.

| piece | lines | tracked? |
|---|---|---|
| `.claude/skills/` (33 skills, 39 files) | 6,578 | yes |
| `.claude/hooks/` (30 files, incl. 642 lines of tests) | 2,370 | yes |
| `.claude/agents/` (12 subagents) | 562 | yes |
| `.claude/rules/` (6 files, 47 rules) | 373 | yes |
| `.claude/workflows/` | 557 | yes |
| `.claude/manifests/surfaces.json` | 2,048 (now much larger) | yes, but GENERATED |
| `tools/` (11 scripts) | 2,411 | yes |
| `eslint-rules/` (27 rules) | 2,635 + 435 tests | yes |
| **hand-maintained total** | **~15,600** | |
| `.claude/specs/` | 7,728 | **no, gitignored** |
| `.claude/audits/` | 2,301 | **no** |
| `.claude/drive/` | 905 | **no** |
| `.claude/plans/` | 429 | **no** |
| **generated session exhaust** | **~11,363** | |

The app is roughly 164,000 lines (`apps/web` 78,495, `apps/mobile` 85,209). So the harness is
about 9.5% of the app, not 15%.

**VERIFIED. The cost curve, split at the #539 escalation:**

| window | harness commits | total | share |
|---|---|---|---|
| 2026-06-19 to 07-14 | 41 | 231 | **17%** |
| 2026-07-15 to 07-20 | 38 | 90 | **42%** |

The steady-state tax is 17%, which is defensible for a linter plus CI tooling plus cross-repo
contract agents. The 42% is the #539 firefight. Quoting the blended 26% as a trend, which this
session did at first, overstates the problem.

**VERIFIED. Always-loaded context per session: ~736 lines / ~12,300 words.** Global `CLAUDE.md`
(45), `tooling-defaults.md` (11), brain `hot.md` (55), project `CLAUDE.md` (88), two sibling repo
`CLAUDE.md` imports (135), `MEMORY.md` (29), and **all six `.claude/rules/*.md` files (373)**.

That last item matters. `.claude/rules/README.md` states the tier is situational: *"CLAUDE.md is
always-loaded and pays for every line. These rules are situational; a debugging rule is noise
during a design pass."* Root `CLAUDE.md` contains no `@` import for them. Yet all six were present
in this session's context at startup, during a read-only research task that is neither debugging
nor reviewing nor writing i18n copy. **The tier built to avoid always-loaded cost is
always-loaded.** Its stated design goal is inverted in practice.

---

## 2. What actually failed on #539

**VERIFIED first-hand.**

1. `git diff --quiet 7d7c42c3 HEAD -- "apps/web/app/(app)/explore/page.tsx"` returns exit 0. The
   file is byte-identical to the pre-redesign baseline. `verdicts.json` records it as
   `"status": "transformed"` on both votes. The completion oracle certified a file nobody touched.
2. Running `node tools/check-surface-coverage.mjs` twice on an unchanged tree gave identical
   output both times (204/224 unverified). **The oracle is deterministic. The judge is not.** The
   documented 16 to 20 to 19 to 20 oscillation is a judge property, not a gate property. This
   localises the defect precisely.
3. **The judge was not rubber-stamping.** Counting statuses in `verdicts.json`: 6 `transformed`,
   7 `partial`, 9 `broken`, 1 `default`. **17 of 23 judged surfaces were rejected.** It has exactly
   one documented false pass. Its blockers include a broken paywall on `route-upgrade` (plan cards
   never render, "Payment service temporarily unavailable"), a `route-preferences` toggle row
   rendering with no Switch control at all, and the public profile `route-u-slug` rendering
   entirely untranslated English in a Brazil-first market. It also cross-referenced one of its own
   findings to the human defect log by number.
4. **The old denominator did not cover the deliverable.** The 224-cell manifest had zero
   `apps/mobile` cells and captured at `viewport: "1280x900"` (`tools/capture-surfaces.mjs:299`).
   Issue #552 specifies the demo clips as **portrait 1080x1920 on a real Android device**. Seven
   sessions were spent verifying desktop web to unblock a deliverable filmed on mobile Android.
   `apps/mobile` has no `e2e` directory and no visual tooling. #539 is labelled `parity-required`.
5. **The harness fought itself, twice.** `surface-coverage-gate.mjs:8-18` documents the first:
   the Stop hook exited 2 on every turn, which in a headless `claude -p` child rejected the final
   message and destroyed the `{"status":...}` line the driver greps for. Three bundles were logged
   `unknown`; `social` had already committed, pushed and reported honestly. The circuit breaker
   then halted a healthy run. Commit `b329a7da` documents the second: judge children needed
   `--safe-mode` so the same Stop gate could not hijack the judge's verdict message.
6. **The guard blocks reads. Four times in this session alone.** `forbid-gate-tamper` blocked a
   `node -e` that only read `verdicts.json`, a `grep -c` on the manifest, a `node -e` requiring the
   manifest, and a `head -20` of `signoff.json`. Its own block message says "Reading it (cat/jq/git)
   is fine." That is false in the exact case it fires, because `READ_ONLY_LEADERS` in
   `_lib/rules-gate-tamper.mjs:22` is anchored with `^` against the entire command string.
   **An independent reviewer flagged the same file Critical on PR #560**, for a different reason:
   the guard is bypassable by command chaining via the exact `--output=` technique that root
   `CLAUDE.md` itself warns about.

**VERIFIED, and the sharpest finding of the session: the finish line contradicts itself.**

Issue #539 acceptance criterion 1 reads *"Reduce glow (keep the violet)... reserve it for the
primary CTA + FAB only"*, and item 4 says *"keep the intentional navy-violet gradient header + a
single restrained glow as deliberate so they aren't flagged."*

`DESIGN.md:118` reads *"There is no `--gradient-header` and no glow shadow. Both tokens are
deleted, not softened."* `DESIGN.md:461` bans decorative gradients of any kind. Two `error`-level
ESLint rules enforce the deletion. The issue has had no comments since 2026-07-17.

**The gates enforce the opposite of what the launch-gate issue asks for, and no document defines
"done" that both sides agree on.** Part of why seven sessions could not close #539 is that the
target moved and the issue was never updated.

---

## 3. Candidates evaluated, against primary sources

Every project below was checked on its live repo or docs page on 2026-07-19. Anything that could
not be verified on a primary source was rejected and is named as such.

### GSD (the one the question named)

**Disqualified on supply chain, not merit.** GSD is "Get Shit Done", a Claude-Code-native
spec-driven workflow. The original repo
[`gsd-build/get-shit-done`](https://github.com/gsd-build/get-shit-done) (64.8k stars, 78 releases)
was **archived 2026-06-26** after the maintainer ran a rug-pull on an associated `$GSD` crypto
token and vanished. The original npm packages remain published and installable;
[security advisories urge purging them from CI](https://aiproductivity.ai/news/gsd-ai-tool-rug-pull-security-warning/).

The live successor is [`open-gsd/gsd-core`](https://github.com/open-gsd/gsd-core) (v1.7.0,
2026-07-15), maintained by an original collaborator, with the
[fork rationale in Discussion #109](https://github.com/open-gsd/gsd-core/discussions/109).

Mechanism: six `/gsd:*` slash commands writing a `.planning/` directory of plain Markdown
(`PROJECT.md`, `ROADMAP.md`, `STATE.md`, per-phase `RESEARCH/PLAN/SUMMARY`). Completion is decided
by `/gsd:verify-work`, which walks a **human** through a scripted checklist, plus a build/test gate
on merge. **No multi-repo support documented anywhere.** No unattended mode documented.

Verdict: a source of borrowed ideas (fresh-context-per-phase, a `STATE.md` convention), not a
replacement. Its completion gate is weaker than what this repo already has.

### GitHub spec-kit

[`github/spec-kit`](https://github.com/github/spec-kit), v0.13.0 (2026-07-17), ~122k stars, 195
releases, MIT. `specify init` writes `.specify/` plus agent-specific command folders. Commands are
namespaced `/speckit.constitution`, `/speckit.specify`, `/speckit.plan`, `/speckit.tasks`,
`/speckit.implement`, `/speckit.converge`. Supports 30+ agents.

**Completion: no deterministic check.** `/speckit.converge` is the model re-reading the codebase
against its own spec and appending remaining work as new tasks. The model wrote the tasks and the
model says they are done.

**Multi-repo: explicitly unresolved.** [Issue #1095](https://github.com/github/spec-kit/issues/1095),
[#581](https://github.com/github/spec-kit/issues/581), [#1026](https://github.com/github/spec-kit/issues/1026)
all open; a [community fork](https://github.com/sakitA/spec-kit-preset-multi-repo-branching) exists
precisely because core does not cover it. It also had a real maintenance stall in mid-2026
([Discussion #1482](https://github.com/github/spec-kit/discussions/1482)), since resolved.

### AGENTS.md

[agents.md](https://agents.md/), stewarded under the Linux Foundation's Agentic AI Foundation.
Plain Markdown, no schema. **Claude Code does not read it natively as of today**:
[anthropics/claude-code#6235](https://github.com/anthropics/claude-code/issues/6235) is an open
feature request. Buys portability only if you also daily-drive Codex, Cursor or Copilot. This
repo's `CLAUDE.md` already bans creating one, correctly, because opencode reads `CLAUDE.md`
natively and an `AGENTS.md` would shadow it.

### BMAD-METHOD

[`bmad-code-org/BMAD-METHOD`](https://github.com/bmad-code-org/bmad-method), v6.10.0 (2026-07-03),
50.8k stars. A 12-persona agile-team simulation (Analyst, PM, Architect, Scrum Master, Dev, UX)
with structured handoffs and a "Party Mode". Completion mechanism undocumented in primary sources.
**INFERENCE:** wrong-sized for a solo operator; it is overhead built to coordinate humans plus
agents across a team.

### OpenSpec, Agent OS, Kiro, Tessl, Traycer

- [`Fission-AI/OpenSpec`](https://github.com/Fission-AI/OpenSpec) v1.6.0 (2026-07-10). The most
  credible lightweight kit, and the only one with real multi-repo intent: a beta "Stores" feature
  holding shared specs in their own repo. Completion is still agent-marked tasks.
- [`buildermethods/agent-os`](https://github.com/buildermethods/agent-os) v3.0. Standards injection.
  No completion mechanism. Redundant with `.claude/rules/`.
- [Kiro](https://kiro.dev/docs/specs/) (AWS). Three-doc spec system with EARS requirements syntax.
  Vendor-locked to AWS tooling.
- [Tessl](https://tessl.io/): pre-GA, in closed beta roughly nine months, pivoted 2026-01-29.
- [Traycer](https://docs.traycer.ai/integrations/agents): a plan-first verification layer over
  Cursor/Claude Code. Verifies against its own generated plan, not an independent artifact.
- **Conductor: rejected. No credible primary source found under that name in this space.**

### Competing harnesses

| tool | config surface | completion decided by | unattended | maintenance |
|---|---|---|---|---|
| [Aider](https://github.com/Aider-AI/aider) | `.aider.conf.yml` + `CONVENTIONS.md`, under 200 lines | `--auto-test` retries until exit 0. **Per-edit gate, not a task oracle** | no | v0.86.2, Feb 2026 |
| [Amp](https://ampcode.com/manual) (Sourcegraph) | `.amp/settings.json`, `AGENTS.md`, `.agents/checks/` | user-specified check; agent iterates on feedback | yes, "orbs" + `--no-tui` | active |
| [OpenHands](https://github.com/OpenHands/OpenHands) | mostly runtime/Docker | agent self-report inside a sandbox | yes | v1.6.0, Mar 2026 |
| [Cursor](https://cursor.com/docs/rules) | `.cursor/rules/*.mdc`, glob-scoped | agent self-assessment; PR review is the human gate | yes, cloud background agents | active |
| [Codex CLI/Cloud](https://developers.openai.com/codex/pricing) | `AGENTS.md`, nestable | container can run tests; no hard gate documented | yes | active |
| Devin | VM per task | self-report in its own VM | yes | $20/mo + $2.25/ACU |
| Factory (Droids) | multi-agent pipeline | review/test droids; closest to a real CI gate | yes | active, $150M Series C |
| **Google Jules / Gemini CLI** | `GEMINI.md` | n/a | n/a | **DEAD for consumers 2026-06-18** ([The Register](https://www.theregister.com/ai-ml/2026/05/20/bye-bye-gemini-cli-google-nudges-devs-toward-antigravity/5243605)) |

**Cross-cutting answer: no commercial tool natively binds "done" to a deterministic check stronger
than a retry loop.** Aider's `--auto-test` is the closest and it is a per-edit gate. Everything else
ends at model self-report followed by human PR review.

### Vanilla Claude Code, evaluated seriously

**SOURCED and VERIFIED locally (`claude --version` returns 2.1.214).** Natively available today:
plan mode, `/goal`, `/loop`, cloud Routines, desktop scheduled tasks, skills, subagents, 29 hook
events with blocking Stop semantics, checkpointing, `claude -p` with
`--output-format json --json-schema`, and sandboxing.

I confirmed `/goal` runs in this install: `claude --print "/goal"` returns
`No goal set. Usage: /goal <condition>`.

**But `/goal` does not replace the driver, and an earlier draft of this analysis was wrong to say
it did.** From [the docs](https://code.claude.com/docs/en/goal):

> "`/goal` is a wrapper around a **session-scoped** prompt-based Stop hook... the condition and
> **the conversation so far** are sent to your configured small fast model."

> "Setting a goal with `-p` runs the loop to completion in a **single invocation**."

> "The evaluator... **does not call tools**, so it can only judge what Claude has already surfaced
> in the conversation."

So `/goal` loops inside one context that keeps growing, and its evaluator cannot independently read
a file or run a test. It is the opposite of a fix for context bloat, and it is weaker than this
repo's verifier subprocess (which is a separate model, in a fresh context, with a read-only tool
allowlist).

**They are complementary.** The driver's fresh `claude -p` per bundle is what resets context
between bundles. `/goal` is what keeps a single bundle iterating until its own condition holds.
The right architecture uses both.

**Anthropic's own best-practices doc endorses this repo's architecture**, not the vanilla
alternative: *"set the check as a `/goal` condition... a Stop hook runs your check as a script and
blocks the turn from ending until it passes... a verification subagent... so the agent doing the
work isn't the one grading it."* And: *"The longer Claude works unattended, the more an independent
check matters before you count the work as done."*

The one place the same doc argues for less is context: *"If your CLAUDE.md is too long, Claude
ignores half of it because important rules get lost in the noise... For each line, ask: 'Would
removing this cause Claude to make mistakes?' If not, cut it."*

---

## 4. The decisive technical finding

**SOURCED.** A vision model cannot be a completion oracle for UI work. This is measured, not
argued.

- [**DiffSpot**, arXiv 2605.29615](https://arxiv.org/html/2605.29615) benchmarked 13 frontier VLMs
  on 4,400 paired web-UI images with single-CSS-property changes. Best model (Gemini 3.1 Pro):
  **40.7% accuracy** identifying real visual changes. On the hard tier, **every model scored under
  23% recall**. On genuinely unchanged pairs, aggressive models **hallucinated a change on 18-24%
  of them**. Detection accuracy varies wildly by property (`line_height` median recall 4.0%), and
  pixel magnitude does not predict detectability. Its explicit recommendation: *"don't rely on
  single VLM calls for critical UI regression testing... pair VLM assessment with traditional
  pixel-difference detection."*
- [**Reliability without Validity**, arXiv 2606.19544](https://arxiv.org/abs/2606.19544v1):
  ~541,000 judgments across 21 judges. High aggregate test-retest reliability (>0.95) **coexists
  with severe position bias** in production-deployed judges. Aggregate stability numbers can look
  fine while individual verdicts still flip, which is exactly the observed oscillation.
- [arXiv 2603.28304](https://arxiv.org/html/2603.28304v1): temperature is load-bearing; low
  temperature is "highly stable and reproducible", high temperature "severely compromises
  reliability."
- [Braintrust's guidance](https://www.braintrust.dev/articles/what-is-llm-as-a-judge): judges
  without source documents "default to assessing whether the response sounds plausible." That is
  the text analogue of the `route-explore` bug exactly.

**The critical implication:** showing the judge a before/after pair, which is the intuitive fix,
is **necessary but not sufficient**. DiffSpot measured models *given the pair* and they still
missed most changes and still hallucinated on unchanged pairs. Temperature 0, N-vote majority and
rubric decomposition all reduce noise but none of them fixes "graded conformance instead of
change"; only a reference anchor does, and a deterministic one beats a model one.

**The established three-layer alternative:**
1. Deterministic change detection: Playwright `toHaveScreenshot` against a committed baseline, or
   a static signature of render-affecting source. Answers "did this change" with certainty.
2. Structural adoption counting: ESLint/AST counts of "N of M call sites migrated". Answers "did
   the migration happen".
3. The vision model as a **defect detector that can only veto**, never as the pass condition.

---

## 5. What practitioners who ship actually run

**SOURCED.** Nobody publishes anything close to this harness.

- [Matt Pocock's real personal `CLAUDE.md`](https://github.com/mattpocock/skills/blob/main/CLAUDE.md):
  **47 lines**. His repo is many small on-demand skills, not one large always-loaded file.
- [citypaul's dotfiles](https://github.com/citypaul/.dotfiles): current `CLAUDE.md` ~340 lines,
  always-loaded context ~160. **Documented as cut down from 3,000+ lines after the author found the
  large version degraded instruction-following.** This is the single closest comparator and it is a
  documented backfire-and-fix.
- [Freek Van der Herten](https://freek.dev/3026-my-claude-code-setup): `CLAUDE.md` ~35 lines,
  4 custom agents, 40+ skills.
- **Boris Cherny**, who leads Claude Code at Anthropic: *"My setup might be surprisingly vanilla!
  Claude Code works great out of the box, so I personally don't customize it much."*
- **Dex Horthy**, who popularised the overnight agent loop, on Anthropic's own more elaborate
  plugin: it *"dies in cryptic ways"* and *"misses the key point"*; he
  [keeps his 5-line bash loops](https://www.humanlayer.dev/blog/brief-history-of-ralph).
- **Armin Ronacher**: *"Present-day hands-off harnesses... produce worse code than what we were
  producing last autumn"*, and stacked incremental defenses in a loop *"slowly become less
  understandable while appearing more robust."*
- On unattended runs the credible pattern is **periodically supervised**, not walk-away. Addy
  Osmani: *"Verification is still on you. A loop running unattended is also a loop making mistakes
  unattended."*

**On "loop engineering" specifically:** the vault's existing conclusion holds. The term went viral
from a Peter Steinberger tweet on 2026-06-07. It postdates
[Simon Willison's "tools in a loop" definition](https://simonwillison.net/2025/Sep/18/agents/)
(Sept 2025) and Geoffrey Huntley's Ralph technique by 9-12 months. Everything it prescribes
(triggers, state files, retry-until-green, a rules file that grows by postmortem) maps onto CI/CD
reconciliation loops plus TDD. **No benchmark, no before/after metric, no controlled comparison
exists in any source found.** It names an existing pattern.

---

## 6. What the council and the adversaries concluded

Three independent lenses, blind to each other, all landed on **prune**:

- **Sunk-cost skeptic:** the from-scratch answer is about 22%. Rebuild all 27 ESLint rules, ~6
  hooks, 3 subagents, ~5 skills. Do not rebuild the drive engine or the visual gate.
- **Maintenance realist:** refuse to own the `.opencode/` mirror (inverted schema, silent
  widening), the vision judge in the blocking path, and `forbid-gate-tamper`. Every failure was
  invisible-class, diagnosed only by a human reading logs afterward. *"A gate that changes verdict
  with no input change isn't a gate, it's weather."*
- **Shipping pragmatist:** four to five working days to clips. Merge #419, clear #560, fix the
  paywall, hand-fix the defects on clip surfaces, record.

Two adversarial advocates argued opposite maximalist positions, and **both lost ground honestly**:

- The **"delete everything, vanilla only"** advocate audited the 32 skills expecting ceremony and
  found **29 load-bearing**, and conceded the ESLint rules outright (13 of 26 catch defect classes
  no built-in rule catches). It finished at ~40% confidence in its own maximalist position and
  ~90% on the narrow claim that the surface-coverage gate and tamper guard are net-negative.
- The **"one bad gate, keep it all"** advocate won two factual corrections that are now in this
  document: the 17% steady-state commit share, and the 17-of-23 judge rejection rate. It proposed a
  ~55-line repair. Its proposed fix 2 (show the judge a before/after pair) is refuted by DiffSpot;
  its fix 1 (a deterministic baseline diff, ~8 lines) is correct and cheap.

---

## 7. Conclusion

**Prune. Keep roughly a third, delete the rest, replace nothing.**

Replacing is off the table on evidence, not sentiment. Every off-the-shelf candidate decides
completion by letting the model tick its own checkbox, none handles cross-repo contract lockstep,
the one the question named has an archived repo and a live supply-chain advisory, and one of them
(Jules/Gemini CLI) shut down last month. Adopting any of them would reopen the exact failure that
started this: a session shipping 5% of a visual pass and reporting it done.

But the harness is a severe size outlier against every published comparator, and three components
are causally implicated in the #539 failure rather than incidental to it.

**What was actually wrong, in one sentence:** the completion oracle was a vision model, which
measurement says cannot do that job at any prompt; and a Stop hook firing on every turn of every
child collided with a driver that parsed stdout, so the system built to prevent a false "done"
manufactured false failures instead.

---

## 8. What changed on 2026-07-19 afternoon, and why it changes the recommendation

**VERIFIED by running the rebuilt oracle.** The concurrent session's rebuild is not a patch. It is
a different instrument, and it independently implements the three-layer architecture the research
above converges on.

```
0/804 cells DONE (touched AND defect-clear AND human-signed)
  touched       604/804   an owned file's visual signature moved since 7d7c42c3
  defect-clear    0/804   independent judge report on file, no blocker
  human-signed    0/804   the ONLY axis that grants completion
SCOPE: 804 cells = 171 surfaces x state x theme x locale
  mobile     0/348  cells done   (NO pixel pipeline exists for React Native: static + human evidence only)
  web        0/456  cells done
  baseline 7d7c42c3   HEAD 60d8d9d7
```

What it fixed, mapped to the failures in section 2:

| failure | fix in the rebuild |
|---|---|
| judge graded conformance, not change | `tools/visual-signature.mjs` computes a **render-affecting AST fingerprint** (JSX element and attribute names, string and numeric literals, dotted property chains) and compares it to baseline `7d7c42c3`. Deterministic. Its header notes it deliberately excludes comments, whitespace, imports and renames so a `prettier --write` sweep cannot flip every surface to "worked on" |
| denominator was not the app | 804 cells across 171 surfaces, **now including 348 mobile cells** and a state axis. It also states honestly that no pixel pipeline exists for React Native |
| judge was the completion oracle | demoted to `defect-clear`, a **veto-only** axis. `signoff.json` cites UI-Lens (CVPR 2026, MLLM F1 20.4% on text overflow), arXiv 2510.08783 and arXiv 2606.13685 as the reason |
| completion was machine-granted | `human-signed` is now **the only axis that grants a cell**, written by Thomas in his own editor, and agents are blocked from writing it. Ticks are signature-pinned so they expire when the surface changes again |

**This is the correct architecture.** It is what the DiffSpot literature recommends, what the
practitioner evidence supports, and what this research was about to propose. It should be finished,
not deleted.

**Two costs it introduces, stated plainly.** 804 cells each requiring a human tick is a very large
amount of your time, and 0/804 is a worse-looking starting point than 20/224 even though it is a
more honest one. And the gate still produced four false-positive blocks on read-only commands
during this session, plus one false completion-claim trigger on a message that was discussing the
gate rather than claiming anything.

**Revised keep/delete, accounting for the rebuild:**

**KEEP**
- `eslint-rules/` in full (2,635 + 435 test lines). Best ratio in the repo: a decade-stable
  extension point, CI-enforced, zero context cost, provider-independent. The `error`-level design
  rules report zero violations, meaning they are holding a line that was won. **But**
  `local/spacing-scale` sits at `warn` with **526 open violations** (down from an audited 1,157
  baseline): that is a migration backlog, not a gate. Promote or delete it, do not leave it.
- The rebuilt visual gate: `visual-signature.mjs`, the three-axis oracle, `signoff.json`.
- `.claude/hooks/git-guardrails.mjs`, `forbid-secret-in-argv.mjs`, the three `csharp-*` hooks,
  `forbid-hardcoded-brand-color.mjs`, `forbid-em-dashes.mjs`.
- `.claude/agents/parity-checker.md`, `contract-aligner.md`, `i18n-syncer.md`. **The genuinely
  irreplaceable part**: no toolkit surveyed handles cross-repo contract lockstep. Verified as an
  explicit gap in all six.
- `.claude/agents/Explore.md`, `audit-readonly.md`, `web-researcher.md` (leaf workers; the
  no-`Agent`-tool cap is a real structural guard).
- `.github/workflows/visual.yml` plus the committed Playwright baselines and the hermetic mock-api
  harness. A visual spec is 10 lines (`apps/web/e2e/visual/today.visual.ts`), so extending
  deterministic coverage is tedious, not hard.
- `DESIGN.md`, `CLAUDE.md` (cut to ~35 lines), `TESTING.md`, `lefthook.yml`, `tools/rollup.sh`.
- Skills: `validate`, `dev-server`, `pr-review`, `commit-sweep`, `rollup`, `handoff`, `investigate`,
  `deep-research`, `llm-council`, `lesson`.

**KEEP AND SHRINK**
- `.claude/skills/drive/run.mjs` (515 lines). **Do not delete it.** Its fresh `claude -p` per
  bundle is the only thing that resets context between bundles and nothing native replaces it.
  Remove `parseJsonLine`'s 13 lines of regex brace-scraping in favour of
  `--output-format json --json-schema`, and have each child run `/goal "<bundle acceptance
  criteria>"` internally so it iterates instead of getting one shot. Target ~350 lines.

**DELETE**
- `.claude/hooks/forbid-gate-tamper.mjs` + `_lib/rules-gate-tamper.mjs` (124 lines). Four
  false-positive blocks on reads in one session, and flagged **Critical on PR #560** as bypassable
  by command chaining. It fails open to the determined and closed to the compliant. If the
  human-signoff axis needs protection, protect `signoff.json` alone with an allowlist on the last
  shell segment, not a prefix match on the whole command.
- 21 skills with zero references in `CLAUDE.md` or `WORKFLOW.md` and no CI wiring: `plan`, `prime`,
  `implement`, `batch-grill`, `create-prd`, `prd-interactive`, `create-stories`, `feature`,
  `prod-readiness` (~22.8M tokens per run against a weekly rate limit), `thermo-nuclear-*`, the four
  `audit-*`, `mirror-harness`, `provider-update`, `make-tool`, `second-opinion`, `dep-sweep`,
  `profile`, `android-generate`. Salvage ~20 lines of genuinely unknowable facts (dev-server boot
  order and ports, the prebuild env baking, `TEST_ACCOUNTS`) into `CLAUDE.md`.
- `.claude/rules/` (373 lines). Always-loaded against its own stated design. Compress the ~10
  load-bearing rules into `CLAUDE.md`.
- `.opencode/` (320 tracked lines). A security-shaped config, hand-mirrored, on an inverted
  allowlist/denylist schema, for a tool that is not the daily driver.
- The unscoped bare `Agent` grants in `implement-opus.md` and `implement-sonnet.md`, flagged High
  on #560 for contradicting those files' own stated scope.
- `WORKFLOW.md` if `/drive`'s surface changes materially.

Net: roughly 15,600 to 6,000 hand-maintained lines. Always-loaded context from ~736 to ~250.

---

## 9. The plan, with hours

| step | hours | basis |
|---|---|---|
| 1. Reconcile #539's acceptance criteria with `DESIGN.md`'s de-decorated freeze, or reverse the freeze. Pick one | **0.25** | editing an issue body |
| 2. Merge orbit-api #419, watch the Render deploy, curl the endpoint | **0.75** | `gh pr view`: OPEN, MERGEABLE, CLEAN, APPROVED, not draft |
| 3. Establish a no-concurrent-session rule, or a lockfile in `run.mjs`'s existing `preflight` | **0.5** | `preflight` already checks `isClean` |
| 4. Fix `forbid-gate-tamper` to match on the last shell segment, or delete it | **0.5** | 3-line change or `git rm` |
| 5. Shrink `run.mjs`: `--json-schema` output, `/goal` inside each child | **2** | replacing 13 lines of regex with a flag, plus a prompt change |
| 6. Delete the 21 skills, the rules tier, `.opencode/`; salvage ~20 lines into `CLAUDE.md` | **2.5** | deletion plus one careful salvage pass |
| **subtotal, harness** | **6.5** | |
| 7. Triage #560's 26 threads; split the harness changes out of that PR | not estimated | I read the thread titles, not the diffs |
| 8. Fix the `/upgrade` paywall | not estimated | functional bug, cause unknown |
| 9. Hand-fix the 12 human-found defects | not estimated | 3 sit on clip surfaces |
| 10. Sign off the demo-critical cells against the contact sheet | not estimated | depends on how many cells a clip actually needs |

Steps 7-10 are real product work and this document refuses to estimate them, because
`fix-problem.md` section 4 records that the last set of estimates were extrapolated from two
bundles across a regime change and should not be planned against. Measure the first two defects
end to end, then extrapolate.

**Note on PR #419.** An earlier draft of this analysis claimed "#560 breaks production until #419
deploys." **That is wrong and is corrected here.** `git show origin/main:packages/shared/src/types/gamification.ts`
shows `levelTitleKey` is **not on main**; it exists only on the b5 branch. Production is not broken
today. The correct statement is that #419 must deploy **before** #560 merges, or it breaks then.

**Note on PR #560.** It is not mergeable as-is: 710 files, `CHANGES_REQUESTED`, 26 unresolved
threads including a Critical for a newly-introduced decorative glow in the very PR that bans glow.
Roughly a third of the threads review the harness rather than the app. Merging it as-is also
cements the glow ban that contradicts #539's written acceptance criteria.

---

## 10. The strongest argument against this recommendation

**Kept visible deliberately.**

The remedy proportionate to one wrong comparison is not a purge. The judge rejected 17 of 23
surfaces and found a broken paywall, a missing Switch control and an untranslated public profile
that no human reported. The Stop-hook collision is already fixed in `b238d3a2`. The concurrent-session
problem is a discipline failure, not a harness failure. And the deterministic delta check that this
document treats as the fix is **8 lines**, or in the rebuilt version one new file. Against that,
deleting 21 skills and a rules tier is unrelated to anything #539 post-mortem implicates. Those are
separable decisions and this document has at times treated them as one.

There is also a real regression window. The gate exists because a past session shipped 5% and
called it done. Any period where the gate is paused and the replacement is not finished is a period
where "done" is a sentence a model writes.

And the load-bearing external evidence is applied by analogy. DiffSpot measures change-spotting
between image pairs; the judge does spec-conformance grading from a single image. This document
argues the second is at least as hard as the first. That is reasoning, not measurement.

**The one-hour test that would settle it:** hand-label 20 cells yourself, run the judge twice
against them, and check agreement. Above ~90% and stable, the instrument is real and this
document's demotion of it is wrong. That test has never been run.

---

## 11. Why this approach is the best one

**Because it is the only option that survives all three bodies of evidence at once.**

Every other answer fails at least one of them:

**Against the market evidence, "replace" fails.** Fourteen alternatives were checked against live
primary sources. Not one decides completion by anything stronger than the model's own say-so
followed by human PR review. Not one handles a Turborepo plus a separate .NET repo changing in
lockstep behind a shared Zod contract. The one the question named is archived with a live
supply-chain advisory; another shut down for consumers last month. Adopting any of them trades a
broken oracle for no oracle, and reopens the founding failure. **You would be paying migration cost
to get something worse.**

**Against the measurement evidence, "keep" fails.** A vision model at 40.7% best-case accuracy,
hallucinating change on 18-24% of unchanged pairs, cannot be a completion oracle, and no prompt
fixes that. The `route-explore` false pass was not a bug in your prompt; it was the technology
behaving as measured. Keeping the judge in the granting path means keeping a coin flip wired to a
Stop hook, and the observable cost of that was 0 completed bundles across two overnight runs and
seven failed sessions.

**Against the practitioner evidence, "keep everything" also fails.** The heaviest documented real
config from a serious shipper is ~340 always-loaded lines, and its author cut it there from 3,000
after measuring that the large version degraded instruction-following. Matt Pocock runs 47. The
person who leads Claude Code calls his own setup "surprisingly vanilla." You are running ~736
always-loaded lines and ~15,600 hand-maintained ones. That is not "heavy like the pros"; it is off
the chart relative to every published comparator, and the one person who got closest describes it
as the mistake he fixed.

**But against the same evidence, "delete everything" fails hardest of all.** Its own advocate
audited your 32 skills expecting ceremony and found 29 load-bearing. It conceded the ESLint rules
outright. Anthropic's published best practice describes your exact architecture (goal condition,
deterministic Stop-hook gate, independent verification subagent) as the thing to build. Your
cross-repo contract agents have no substitute anywhere in the market. And `/goal`, which an earlier
draft of this analysis wrongly offered as a replacement for your driver, runs in a single growing
context with an evaluator that cannot call tools. **Deleting the driver would make context bloat
worse, not better.**

Pruning is the only position that keeps what measurement supports and drops what measurement
refutes:

- Keep the **deterministic** layers, because they are the only ones that can answer "did this
  change" with certainty: ESLint rules, the AST visual signature, Playwright baselines, git
  guardrails.
- Keep the **domain-specific** layers, because the problem genuinely is bespoke and the market has
  no answer: cross-repo contract alignment, parity, the C# hooks, `DESIGN.md`.
- Keep the **model** layer but only where models are actually good: the judge as a veto-only defect
  detector, which in 23 judgments found a broken revenue path, a missing control and an
  untranslated share surface.
- Give the **granting** decision to the human, because taste is the one judgment that cannot be
  delegated and the literature says so explicitly.
- Delete the layers that exist only to support other layers, or that block the compliant while
  failing open to the determined.

There is one more reason, and it is the strongest. **The rebuild that landed mid-session already
did most of this independently.** A different session, with no access to this research, arrived at
a deterministic signature check, a veto-only judge, a human-only granting axis, and a denominator
that finally includes mobile. When an independent implementation and an independent research pass
converge on the same architecture from opposite directions, that architecture is very likely
correct.

**The remaining work is not to choose a direction. It is to finish the one you are already on, and
to stop paying for the parts that were never on it.**

---

*Written 2026-07-19. No production code or harness file was modified in producing it. Every "VERIFIED"
claim was established by a command run in this session; every "SOURCED" claim carries a live URL
fetched the same day. The 0/804 figure is the rebuilt oracle's own output as of HEAD `60d8d9d7`.*
