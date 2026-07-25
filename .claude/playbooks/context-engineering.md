# Context engineering: writing anything the agent will read

**At a glance:** the standing rules for authoring a `CLAUDE.md`, a rule, a playbook, a skill, an
agent, or a ticket body. Read it before you write or edit one. Source: Anthropic's 2026-07-24
"The new rules of context engineering for Claude 5 generation models", which removed over 80% of
Claude Code's own system prompt for Opus 5 and Fable 5 with no measurable loss on coding evals.
Everything here is the delta between what a 4-generation model needed and what a 5-generation
model needs. Companion: `.claude/playbooks/README.md`, which measures what this tier costs.

## 1. Constrain less; the model has judgement now

Guardrails written for older models are now the expensive kind of noise: the agent must resolve
your instruction against the user's intent and the surrounding context before it can act, and
conflicting standing prose makes that resolution slower and less predictable, not safer.

Anthropic's own example: they replaced "default to writing no comments, never write multi-line
comment blocks" with "write code that reads like the surrounding code: match its comment density,
naming, and idiom." The second is shorter, has no exceptions to maintain, and is right in the cases
where the first was wrong.

Write the target behaviour and let the model apply it. Keep a hard prohibition only where a single
violation is genuinely costly (a force push, a production mutation, an irreversible delete), and
even then pair it with what to do instead.

## 2. Prompt the positive; a ban names the thing it bans

Steering by prohibition backfires the way "do not think of an elephant" does. A `## Guardrails, do
NOT` section is the usual carrier, and it is usually duplication as well: most of its bullets are
some earlier positive rule turned inside out.

The 2026-07-24 skill sweep cut those sections across most Orbit skills. Cutting rule: delete a
guardrail only when its meaning survives at another site **inside the same file**. A guardrail that
duplicates only against `CLAUDE.md` or `core.md` stays, because deleting it would make the file
depend on another file staying loaded.

## 3. Design the interface instead of writing examples

Examples used to be the number one lever for tool use. For 5-generation models they now constrain
the exploration space: the agent works inside the shape you demonstrated instead of the shape the
problem has.

Spend the effort on the interface. An enum of `pending | in_progress | completed` teaches the tool's
model of the world in three words. A parameter named for its meaning teaches more than a worked
example of it. This applies to Orbit's own surfaces: a `tools/*.mjs` flag set, a ticket template
field list, an agent's `tools:` grant.

## 4. Push it down the ladder, not up front

Anything a run might need and most runs will not belongs behind a pointer. This repo already runs
the pattern: `.claude/rules/core.md` auto-loads, `.claude/playbooks/*` are read by name at the
moment of relevance, and deferred tools load their schemas through ToolSearch. Extend it rather
than growing the top.

The failure this prevents: a `CLAUDE.md` or `SKILL.md` grown into the central repository of
everything the author feared the agent would not find otherwise. That file is paid for on every
turn of every session, and most of it is inert on any given one.

## 5. A `CLAUDE.md` holds gotchas, not the obvious

Say what the repo is in a couple of lines, then spend the tokens on what the agent cannot infer by
reading the file system: the invariant that is not visible locally, the analyzer that is silent
until CI, the field that is append-only because the Play fleet lags.

Do not restate what a gate enforces. `core.md` rule 3 already forbids re-flagging a gate's finding
by hand; restating the gate's rule in prose is the same waste one layer earlier.

## 6. References beat descriptions, and code beats prose

The highest-value line in the source article: *"a HTML mockup of a design will generally produce
better results than a description of the design or a screenshot."*

Prefer, in order: a runnable artifact, then code, then a rubric, then prose. A spec can be a test
suite. A design spec can be a rendered page. A taste can be a rubric a verifier agent applies.

This is a diagnosis of the #539 failure, not a style note. REBUILD.md 1.2 names the causes as "the
spec is subtractive" and "nothing in the loop rendered a picture", and `DESIGN.md` carried exactly
one mechanical rule with everything else as prose adjectives. D42 is the correction: ticket 0 ships
`design/reference.html` alongside the prose, and where the two disagree the rendered page wins.

## 7. Memory is a tool now, not a file section

Durable facts belong in auto-memory, the brain vault, or a generated artifact that CI keeps fresh.
A hand-maintained list of facts about the code inside a `CLAUDE.md` is the D12 lie waiting to
happen: it describes the code, it is not generated, so it starts drifting the day it is written.

## 8. Measure before you trim

`/doctor` is Claude Code's own rightsizing pass over skills and `CLAUDE.md` files. It is an
in-session command, so a human runs it. Run it before hand-trimming, and act on what it measures
rather than on which file feels long.
