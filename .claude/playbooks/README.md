# Playbooks: the on-demand judgement tier

**At a glance:** 47 standing rules that no gate can check, split by activity and read **on demand**.
Nothing here loads automatically. The handful of rules that genuinely apply to every turn live in
`.claude/rules/core.md`, which does load automatically and is deliberately ~50 lines.

## Why these moved out of `.claude/rules/`

`.claude/rules/*.md` is a native Claude Code auto-load: every file in it is prepended to every turn
of every session, relevant or not. This tier had six files and 375 lines there, while its own README
described them as "situational" and told you to read the themed file when you started that activity.
Both things could not be true. The 2026-07-19 edit to that README admitted the contradiction and
then left the files where they were, so the tier kept costing 375 lines a turn for another three
days.

Measured cost of the whole standing set at that point: **738 always-loaded lines per turn**, of
which this tier was more than half. Meanwhile the agents paying for it spent 36.6% of their actions
orienting and 5.6% editing. Standing prose is the most expensive line in a harness and the least
likely to be acted on, because it arrives before anyone knows what the task is.

**Nothing was deleted.** The full text moved here; a ~50-line core stayed behind. The move is safe
because the citation pattern already worked and was already in use:

- `.claude/agents/design-reviewer.md` cites `product-and-content` rule 3 by name.
- `.claude/agents/completeness-critic.md` opens with "visual-delivery is your charter, read it first".
- `.claude/skills/android-release/SKILL.md` cites `debugging.md` mid-flow.

An agent that needs a playbook is told to read it by the skill or agent that needs it. That is a
Read call at the moment of relevance instead of 375 lines on every turn forever.

## Two homes, chosen by whether a file path predicts relevance

`.claude/rules/*.md` supports a `paths:` frontmatter field ([memory docs](https://code.claude.com/docs/en/memory)):
a rule carrying it loads only when Claude reads a file matching its globs, and a rule without one
loads unconditionally. So the tier splits by whether relevance is predictable from a path.

**Path-scoped, still in `.claude/rules/`** - these load themselves at exactly the right moment,
which is strictly better than hoping an agent chooses to read them:

| file | rules | auto-loads on |
|---|---|---|
| `../rules/visual-delivery.md` | 8 | `apps/web/**`, `apps/mobile/**`, `packages/shared/src/theme/**`. Makes completeness structural: surface inventory, per-surface artifacts, the adversarial `completeness-critic` close gate, the seed fixture. Written after #539 b5 shipped at 5% and was reported "done". |
| `../rules/product-and-content.md` | 9 | the i18n JSON, `apps/web/app/globals.css`, the theme, the landing page |

**Activity-scoped, here** - no path predicts "I am now reviewing" or "I am now debugging", so these
are read on demand by the skill or agent that needs them:

| file | rules | read it when |
|---|---|---|
| `debugging.md` | 8 | chasing a bug, triaging an issue, `/investigate`, or resolving a merge conflict |
| `review-and-audit.md` | 11 | `/pr-review`, `/audit-*`, `/commit-sweep`, `/prod-readiness`, or any fan-out assessment |
| `planning-and-artifacts.md` | 11 | `/create-prd`, `/create-stories`, `/plan`, `/drive`, prototyping, ADRs, or deciding whether to hand off |

## How these relate to the gates

A playbook **never overrides** a gate, `CLAUDE.md`, or `DESIGN.md` - those are the documented
standards and they win. These are the floor where nothing is documented, plus the reasoning a gate
cannot carry.

The inverse also holds, and it is rule 1 of `review-and-audit.md` and rule 3 of the always-loaded
core: **if a gate already enforces it, do not re-flag it by hand.** Duplicating a gate in prose is
how a reviewer generates noise and how a rule file starts to rot.

## Adding a rule

Ask which file it belongs in, and whether any skill or agent will actually read that file for the
task the rule governs. If none will, the rule has no consumer and adding it changes nothing. Promote
a rule into `.claude/rules/core.md` only when it applies in **any** turn and no skill invocation
reliably precedes it - that file is paid for on every turn of every session.

## Provenance

Harvested 2026-07-17 from 193 external design/engineering skills, deduplicated and routed in the
vault note `Orbit skill harvest - canonical rule set (#539)` (`brain/2 Areas/20-29 Orbit
Engineering/`). The vault note is the source of truth for *why* each rule was kept and what
corroborated it; this tier is the operational copy. Rules that contradicted a locked Orbit decision
were dropped upstream and are not here.
