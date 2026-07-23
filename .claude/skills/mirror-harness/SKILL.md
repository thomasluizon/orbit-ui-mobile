---
name: mirror-harness
description: Port evolutions in the live private Orbit harness (orbit-ui-mobile/.claude + machine globals) into the public generic pack (agentic-dev-workflow), keeping the mirror in sync. Reads both, diffs live-vs-documented into a staleness report, asks the public/private + depth questions, generalizes every ported concept to pass the pack's genericity gate, then verifies with the pack's own gate suite. Idempotent — re-run whenever the harness changes; when nothing drifted it reports "in sync" and edits nothing. Triggers: /mirror-harness, sync the mirror, update agentic-dev-workflow, port the harness to the pack.
argument-hint: (empty = full gated loop) | check (report-only staleness diff) | --since <git-ref>
---

# Mirror Harness — keep the public pack in sync with the private harness

The **live source of truth** is Thomas's private Orbit harness. The **mirror** is the public,
tool-agnostic pack `agentic-dev-workflow`, whose `core/**` must carry ZERO project strings and
ZERO baked SDLC policy (a CI gate proves it). This skill ports what changed in the source into
the mirror, generalized, and leaves the mirror's genericity gate green.

**Not to be confused with the pack's own `/update-harness`.** That audits the *installed* harness
for *web* drift (a superseded model pin, a deprecated flag). THIS skill audits the *mirror repo*
for *source* drift (the private harness grew a feature the public pack doesn't document yet). One
looks outward at vendors; this one looks sideways from private to public.

## Fixed points (resolve first, every run)

- **SOURCE — live harness** (read-only here; never edited by this skill):
  - `orbit-ui-mobile/.claude/{skills,agents,hooks,rules,manifests}` + root `CLAUDE.md`,
    `WORKFLOW.md`, `DESIGN.md`, `TESTING.md`.
  - Machine globals: `~/.claude/CLAUDE.md`, `~/.claude/rules/*`, `~/.claude/settings.json`
    (effort level, output style, model), `~/.claude/skills/*` (the global-tier skills:
    `grill-me`, `ship`, `clean`, `handoff`-family, …).
- **MIRROR — the pack** at the sibling `…/Projects/agentic-dev-workflow`. If it is not there,
  **ASK for the path via AskUserQuestion — never guess.** It is edited here, so add it as a
  working directory for the run (`--add-dir <path>` or confirm it is already one).
- **Weight recent change.** Read `git -C <orbit-ui-mobile> log --oneline -20` (or `--since <ref>`
  if passed) and treat the newest harness commits as the highest-signal drift to chase first.

The pack's own map of its architecture is authoritative for *where* things live: read its
`README.md` (the CORE table + "Maintaining the pack"), `scripts/gen-adapters.mjs` (the roster),
`scripts/check-genericity.mjs` (the two leak classes), and `workflow.config.example.yaml` (the
config schema) before editing. Don't trust this skill's memory of them over the files.

## Modes

- **`check`** (report-only): produce the staleness report and stop. This is the idempotency probe
  — a clean run prints "in sync (only the deliberate exclusions differ)" and touches nothing.
- **empty** (default): the full gated loop — report → questions → update → verify.

---

## Step 1 — Diff live-vs-documented → the staleness report

Reconcile three rosters plus the free-form docs. Use the **name-map** and **exclusion set**
below so the diff is deterministic across runs (that is what makes "empty" mean something).

Report **both directions**:
- **STALE** — the pack documents something the live source no longer does (a deleted skill still
  registered; a skill body describing an old flow).
- **MISSING** — the live source does something the pack never documented (a new agent, a new
  routing concept, a new rule file).
- **DANGLING** — any pack file that references a live-deleted skill by name (grep `core/**`,
  `README.md`, `workflow.config.example.yaml` for the removed name).

Present it as one table: `# | direction | pack location | live source | what changed | proposed action`.
Group by subsystem (pipeline / agents / rules / config / docs). Cite `file:line` on both sides.

### Name-map (live skill/agent/rule → pack core body)

Skills — `create-prd`→`intake/prd.md` · `prd-interactive`→`intake/prd.md` (warm+cold variants of
one generic body) · `create-stories`→`intake/stories.md` · `thermo-nuclear-code-quality-review`→
`review/thermo-nuclear.md` · `grill-me`→`pipeline/grill.md` · everything else maps by identical
stem (`prime`, `plan`, `implement`, `validate`, `drive`, `batch-grill`, `ship`, `clean`,
`pr-review`, `audit-*`, `prod-readiness`, `commit-sweep`, `second-opinion`, `feature`,
`deep-research`, `llm-council`, `investigate`, `rollup`, `handoff`, `lesson`, `make-tool`).
Agents — `security-reviewer`, `audit-readonly`, `web-researcher`, `primer` map by stem.
Rules — `debugging`, `review-and-audit`, `planning-and-artifacts`, `product-and-content`,
`visual-delivery` map by stem under `core/_shared/rules/`.

### Exclusion set (Orbit-product-specific — NEVER mirror; their absence is not drift)

- **Product/stack skills:** `android-generate`, `dev-server`, `dep-sweep`, `profile`,
  and every personal/global skill (`brain*`, `accesslint-*`, `impeccable`,
  `react-native-best-practices`, `weekly-update`, `obsidian-markdown`, `expo:*`).
- **This skill itself** (`mirror-harness`) — the private→public maintenance tool is not a
  generic pack capability; it lives in the source repo and never mirrors.
- **Folded-into-config agents:** `parity-checker`, `i18n-syncer`, `contract-aligner`,
  `design-reviewer`, `completeness-critic`, `Explore` — the pack expresses these as `pr-review`
  config dimensions + the generic `audit-readonly`/`web-researcher` fan-out workers, by design.
- **Machinery, not rules:** the visual-completion surface-manifest system (`tools/*surface*.mjs`,
  the `surface-coverage-gate` hook) is Orbit-specific plumbing. Its *judgement rules* generalize
  (see `visual-delivery` above); its *scripts* do not.

Anything in the exclusion set that differs between source and mirror is **expected** and must be
named in the report as "excluded by design", not flagged as drift — otherwise the loop is never
idempotent.

## Step 2 — Ask the gate questions (default mode only)

Before any edit, via **AskUserQuestion** (batched, recommended option first):
1. **Depth** — comprehensive port of everything flagged, or a named subset this pass?
2. **Public/private boundary** — confirm fully-generic (the default; the genericity gate enforces
   it) and collect any specific thing to keep out.

These are the two forks the source cannot answer for itself. Everything else — how to generalize a
given concept — you decide by the rules in Step 3. Do not turn Step 3 into more questions.

## Step 3 — Update the mirror (the baked-in rules)

Apply the flagged changes. Every ported concept obeys these, which encode decisions already made:

- **Fully generic, gate-enforced.** No `orbit`/`useorbit`/`thomasluizon`/`astra`, no absolute home
  path, no baked commit trailer / bare tracker CLI / squash directive / literal branch prefix —
  route each policy value through `{{config.*}}`. `scripts/check-genericity.mjs` is the arbiter;
  run it, don't eyeball it.
- **Ship runnable, not just prose.** When the source adds an *engine* (e.g. the `drive` driver that
  spawns one fresh headless agent per bundle), port a **runnable, string-free** version as an
  **authored adapter** (`adapters/claude-code/workflows/` or `…/hooks/`, and the opencode
  `plugin/` twin) — NOT a generated pointer — parameterized entirely through config. Authored
  adapters are hand-edited and survive `gen-adapters`; the genericity gate still scans them.
- **Model tiers stay ABSTRACT in core.** Core bodies name capability tiers — **strong / mid /
  cheap** — never a vendor slug. Concrete model names live in `config.execution.*`. Porting a
  tiered flow (like the `implement-opus`/`implement-sonnet` split) means: (a) generic tier agents
  keyed on the abstract tier, (b) config keys holding the slug map + the per-tier effort, and
  (c) **`setup-harness` must WEB-RESEARCH the current strong/mid/cheap models for the machine at
  interview time** and write them into config — the pack never hardcodes today's roster, because
  it ages out. Add that research step to the setup interview when you port the tier concept.
- **Judgement rules generalize; machinery does not.** A new `_shared/rules/*.md` is fair game if
  its content is project-neutral. The scripts/hooks that enforce an Orbit-only artifact are not —
  they stay in the exclusion set.
- **Edit the source of truth, then regenerate.** Skill/agent roster changes are made by editing
  the `skills`/`agents` arrays in `scripts/gen-adapters.mjs` **and** the `core/**` body, then
  `node scripts/gen-adapters.mjs`, then committing the regenerated `adapters/*/skills` +
  `adapters/*/agents`. Removing a skill = delete its manifest row + its core body + any dangling
  reference. Authored hooks/plugin/workflows are edited directly, never regenerated.
- **Keep the pack's own indexes in lockstep.** Any roster or rule change updates, in the same pass:
  `README.md` (the CORE group table + the roster prose), `core/_shared/behavioral-baseline.md`
  (its list of judgement-rule files), and the relevant `workflow.config.example.yaml` comments.
- **Note deliberate non-generalizations honestly.** When something in the source is intentionally
  left out because it cannot generalize, say so where a maintainer will see it (a README line or a
  config comment), so the gap reads as a decision, not an oversight.

Land it as the pack asks: one feature/fix per PR, on a `feature/`|`fix/`|`chore/` branch, squash
only. Cross-reference the live commit(s) that motivated the port in the PR body.

## Step 4 — Verify (idempotent close)

1. **Run the pack's full gate suite** from the mirror root (these ARE the CI gates — lean on them,
   don't re-derive):
   ```
   node scripts/check-genericity.mjs
   node scripts/test-hook-engine.mjs   && node scripts/test-setup.mjs
   node scripts/test-generate.mjs      && node scripts/test-wiring.mjs
   node scripts/test-bootstrap.mjs     && node scripts/test-update-harness.mjs
   node scripts/test-config-layers.mjs && node scripts/test-repo-clean.mjs
   node scripts/gen-adapters.mjs && git -C <mirror> diff --exit-code -- adapters
   ```
   All must pass; the last line proves the generated adapters match the manifest.
2. **Re-run this skill's `check` mode.** The staleness report must come back **empty except the
   named exclusions**. If a new row appears, it is either a real miss (fix it) or a name-map/
   exclusion-set gap in THIS skill (update the skill so the next run is clean). That self-repair is
   what keeps the loop idempotent.
3. Report: what was ported (with the motivating live commit), what was deliberately excluded and
   why, and the green gate output. A clean re-run says "mirror in sync" and changed nothing.

## Guardrails

- Never edit the live source (`orbit-ui-mobile`, globals) from this skill — it is read-only input.
- Never weaken the genericity gate to make a port fit; generalize the port instead.
- Never present an exclusion-set difference as drift, and never let a real drift hide as an
  exclusion — the honesty of "empty" depends on that line staying exact.
