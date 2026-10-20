# Playbooks: the on-demand judgement tier

**At a glance:** 56 standing rules that no gate can check, split by activity and read **on demand**.
Nothing here loads automatically. The handful of rules that genuinely apply to every turn live in
`.claude/rules/core.md`, which does load automatically and is deliberately ~50 lines.

## Why these are on demand

Activity-specific rules belong in playbooks that agents read when relevant. `.claude/rules/core.md`
holds rules that apply to every turn. The skill or agent that needs a playbook names it directly.

## Two homes, chosen by whether a file path predicts relevance

`.claude/rules/*.md` supports a `paths:` frontmatter field ([memory docs](https://code.claude.com/docs/en/memory)):
a rule carrying it loads only when Claude reads a file matching its globs, and a rule without one
loads unconditionally. So the tier splits by whether relevance is predictable from a path.

**Path-scoped, still in `.claude/rules/`** - these load themselves at exactly the right moment,
which is strictly better than hoping an agent chooses to read them:

| file | rules | auto-loads on |
|---|---|---|
| `../rules/visual-delivery.md` | 8 | `apps/web/**`, `apps/mobile/**`, `packages/shared/src/theme/**`. Surface inventory and the adversarial `completeness-critic` close gate; the owner inspects seeded surfaces once for the whole redesign during D90, per surface otherwise. |
| `../rules/product-and-content.md` | 9 | the i18n JSON, `apps/web/app/globals.css`, the theme, the landing page |

**Activity-scoped, here** - no path predicts "I am now reviewing" or "I am now debugging", so these
are read on demand by the skill or agent that needs them:

| file | rules | read it when |
|---|---|---|
| `debugging.md` | 8 | chasing a bug, triaging an issue, `/investigate`, or resolving a merge conflict |
| `review-and-audit.md` | 12 | `/audit-*`, `/prod-readiness`, acting on a Pullfrog review, or any fan-out assessment |
| `planning-and-artifacts.md` | 11 | `/ticket`, `/orchestrate`, ticket writing, prototyping, ADRs, or deciding whether to hand off |
| `redesign-screen.md` | - | building any of the thirteen redesign screens. The D76 eight-step loop, the step 6 ui-skills sweep with its fetch commands, and what the owner checks that no gate does. Cited from the always-loaded core, because the step this file exists to protect is the one an agent skips when it starts from the ticket alone |
| `context-engineering.md` | 8 | authoring or editing anything the agent itself reads: a `CLAUDE.md`, a rule, a playbook, a skill, an agent, a tool interface, a ticket body. The 5-generation delta: constrain less, prompt the positive, design interfaces instead of writing examples, and prefer a runnable artifact over prose |

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

The source rules are indexed in the
vault note `Orbit skill harvest - canonical rule set (#539)` (`brain/2 Areas/20-29 Orbit
Engineering/`). The vault note is the source of truth for *why* each rule was kept and what
corroborated it; this tier is the operational copy. Rules that contradicted a locked Orbit decision
were dropped upstream and are not here.
