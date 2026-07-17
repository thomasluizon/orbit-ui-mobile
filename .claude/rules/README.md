# Standing rules

**At a glance:** the judgement tier. 39 standing rules that no gate can check, harvested from 193 external skills (#539) and routed here because they are real but not mechanically decidable.

## Why this tier exists

Orbit's operating principle is **gates over prose**: a rule that can be checked by a machine becomes an ESLint `local/*` rule, a `.claude/hooks/forbid-*` guard, or a Roslyn analyzer, because prose decays as context fills. That principle has a corollary it is easy to forget — **the rules a gate cannot express do not stop being rules.** They just stop being enforceable, which makes *where they live* matter more, not less.

These 39 rules are the ones that survived the "can this be a gate?" test by failing it honestly. Each is judgement-bound: it needs a reader who understands the situation. They live here rather than inside a long `CLAUDE.md` for three reasons:

1. **CLAUDE.md is always-loaded and pays for every line.** These rules are situational; a debugging rule is noise during a design pass.
2. **They are re-read, not skimmed.** A themed file you open when you start a review is a document. The same content appended to a 200-line context blob is wallpaper.
3. **They are per-activity.** The themes below map to what you are actually doing.

## The files

| file | rules | read it when |
|---|---|---|
| `review-and-audit.md` | 11 | running `/pr-review`, `/audit-*`, `/commit-sweep`, `/prod-readiness`, or any fan-out assessment |
| `debugging.md` | 8 | chasing a bug, triaging an issue, `/investigate`, or resolving a merge conflict |
| `planning-and-artifacts.md` | 11 | `/create-prd`, `/create-stories`, `/plan`, `/drive`, prototyping, ADRs, or deciding whether to hand off |
| `product-and-content.md` | 9 | touching i18n copy, the landing page, JSON-LD, the design system, or removing anything |

## How these relate to the gates

A rule here **never overrides** a gate, `CLAUDE.md`, or `DESIGN.md` — those are the documented standards and they win. These are the floor that applies where nothing is documented, plus the reasoning a gate cannot carry.

The inverse also holds and is the first rule in `review-and-audit.md`: **if a gate already enforces it, do not re-flag it by hand.** Duplicating a gate in prose is how a reviewer generates noise and how a rule file starts to rot.

## Provenance

Harvested 2026-07-17 from 193 external design/engineering skills, deduplicated and routed in the vault note `Orbit skill harvest - canonical rule set (#539)` (`brain/2 Areas/20-29 Orbit Engineering/`). The vault note is the source of truth for *why* each rule was kept and what corroborated it; this tier is the operational copy. Rules that contradicted a locked Orbit decision were dropped upstream and are not here.
