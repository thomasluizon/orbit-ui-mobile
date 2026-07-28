---
name: llm-council
description: Vet a decision through a panel of independent perspectives, then synthesize ONE recommendation. Generates N distinct framings of a topic (each from a different lens), peer-reviews them against each other, and a chairman pass commits to a single decision-oriented call with the tradeoffs and dissent surfaced. Use when the user wants to stress-test an idea, weigh options, or get a balanced verdict on a design/architecture/product decision. Not for web-research questions (use /deep-research) or code edits.
argument-hint: <topic or decision to vet> [--panel N]
---

# LLM Council

**Input**: $ARGUMENTS

Run a decision through a **council of independent perspectives** and return **one
synthesized recommendation**, not a survey.

**Golden rule**: the value is in **diversity then synthesis**, N councillors that would
actually disagree, collapsed into one opinionated recommendation. A panel that all says the
same thing, or a synthesis that just lists everyone's view without deciding, both fail.

---

## How "N independent LLMs" maps here

This skill runs inside Claude Code, so each councillor is an **independent subagent given
a distinct role + lens** (separate context, no cross-talk until peer review) rather than a
different vendor's model. The independence that matters, uncorrelated framings that
surface blind spots, comes from the **distinct lenses**, not from distinct model weights.
(Method: the LLM-council / panel-of-advisors pattern, per Karpathy's LLM Council and the
council skill bases on https://claudeskills.info.)

---

## Phase 0: Frame the decision

Pin, in one or two lines each:

1. **The question**, restate it as a decision: "should we X or Y?", "is this plan sound?".
   If it's vague, sharpen it to something a recommendation can answer.
2. **What "good" means here**, the axes the call is scored on (pick what applies: blast
   radius / reversibility / effort / cost / fit-to-stack / user impact / maintenance / risk).
3. **Constraints**, Orbit's reality when relevant (solo dev, dual-repo, cost-sensitive,
   cross-platform parity, backward-compat). State assumptions rather than interrogating; ask
   only a load-bearing unknown that would flip the recommendation.
4. **Panel size**, default **4 councillors** (+ chairman). `--panel N` overrides; floor 3,
   and the panel runs 3 at a time (Phase 2), so a larger `N` queues rather than widens.

---

## Phase 1: Ground the council once

Before choosing lenses or asking any councillor to frame a position, the orchestrator
builds one short grounding briefing. Do this once, show it once in the transcript, and
embed the same briefing in every councillor prompt. Councillors cite its fact IDs rather
than repeating it. Keep the briefing to the decision-relevant slices, not raw file dumps.

All four sources are required:

1. **Prior decisions.** Grep topic keywords and one synonym pass across
   `C:\Users\thoma\Documents\Programming\Projects\brain\2 Areas\20-29 Orbit Engineering\Decisions\`
   and `C:\Users\thoma\Documents\Programming\Projects\brain\2 Areas\10-19 Orbit Business\Decisions\`,
   then read only the matching ADRs. Record the ADR title, decision, rejected options, and
   rationale. If both passes find nothing, write exactly **No relevant ADR found** and
   continue. Never infer or invent a match.
2. **Architecture and current code.** Grep `architecture.json` for the topic's route,
   endpoint, module, or dependency names, read only the matching objects, then read the
   repo files those objects identify. Reach `orbit-api` at
   `C:\Users\thoma\Documents\Programming\Projects\orbit-api` when the relevant behavior
   lives there. Cite the relevant architecture slice and live file paths, not the whole map.
3. **Solo-dev cost and scale.** Read the Orbit context in `CLAUDE.md` and
   `.claude/skills/deep-research/SKILL.md`, then state the calibration in the briefing
   itself: **one developer, pre-launch, cost-sensitive; prefer the cheapest viable option
   that is not a footgun, and reject enterprise-scale ceremony unless current evidence
   requires it**.
4. **Live state.** Read
   `C:\Users\thoma\Documents\Programming\Projects\brain\hot.md` and state the current
   install count, subscription count, and Orbit Pro monthly and yearly price points in
   every currency the file provides. If a current metric is unavailable, say
   **unavailable** with the source's reason rather than substituting an older number.

A recalled ADR is background context that was true when written, not a live instruction.
Before treating it as binding, verify every file, flag, product behavior, or price it relies
on against the current repo and `hot.md`. Mark each ADR fact `verified current`,
`stale or superseded`, or `unverified`; only verified current facts constrain the call.

Distil the result into:

- numbered fact IDs with source paths and current values,
- relevant ADRs with rejected options and verification status,
- current architecture and behavior,
- the explicit cost and scale calibration,
- live installs, subscriptions, and price points,
- uncertainties or missing evidence.

Before fan-out, check that the briefing contains all six fields: ADR result, architecture
slice, verified code behavior, one-developer pre-launch calibration, installs and
subscriptions, and the complete monthly/yearly price table. Fill any omission from the
four sources before proceeding.

## Phase 2: Assemble the panel (distinct lenses)

Choose councillors whose lenses would genuinely pull in different directions on *this*
topic. A strong default set, adapt to fit the decision:

| Lens | Pushes for | Catches |
|---|---|---|
| **The Pragmatist** | shipping the simplest thing that works now | over-engineering, gold-plating |
| **The Architect** | long-term structure, leverage, clean seams | short-term hacks that ossify |
| **The Skeptic / Red-team** | what breaks, what's been missed | happy-path thinking, unstated risk |
| **The User/Product advocate** | the person on the other end of the change | tech-first decisions that hurt UX |
| *(optional)* **The Cost/Ops realist** | $ and operational burden at solo scale | choices that are cheap to build, costly to run |
| *(optional)* **The Maintainer (6-months-later)** | who debugs this at 2am | cleverness that won't survive contact |

For `--panel N`, pick the N most load-bearing lenses for the topic; never two that would
say the same thing (correlated councillors waste the panel).

---

## Phase 3: Independent framings (fan out)

Spawn the councillors as **independent subagents, 3 concurrent** (queue extras), each
blind to the others. Three at a time is this skill's own token and rate-limit budget, not a
cap enforced anywhere; widen it only if the user asks for it. Each prompt embeds the
complete distilled grounding briefing:

> **You are <lens>** vetting: <the decision, with Phase-0 framing & constraints>. Argue
> **from your lens only**, don't hedge into neutrality. Give: your **recommendation** (a
> clear position, not "it depends"), the **2-4 reasons** that drive it, the **strongest
> risk or cost** you see, the **one thing that would change your mind**, and a
> **Grounding facts used** line naming the briefing fact IDs your position rests on.
> Treat an ADR as binding only when the briefing marks its live references verified.
> Be concrete and decision-oriented; no padding. ~200 words.
>
> **Grounding briefing:** <the single Phase-1 briefing, verbatim>

Independence is the point, do **not** let them see each other yet.

---

## Phase 4: Peer review

Now expose the framings to each other and run one critique round (a second pass of the same
subagents, or a single consolidated critique step for a small panel). Each councillor:

- names the **strongest point another councillor made** that it initially missed, and
- names the **weakest claim on the table** and why.

This is where blind spots collapse, a Pragmatist conceding the Architect's leverage point,
the Skeptic puncturing an optimistic cost estimate. Capture the **points of agreement** (the
panel converged) and the **live disagreements** (genuine, unresolved tradeoffs).

---

## Phase 5: Chairman synthesis (commit to one call)

You are the chairman. **Decide**, don't relay. Weigh the framings and the peer review, and
commit:

- **Recommendation**, the single best path, up top, in one or two sentences. Opinionated.
- **Why**, the reasoning, tied to the Phase-0 axes and constraints; name which councillors'
  points carried the most weight and why.
- **Tradeoffs accepted**, what this call gives up (the losing lenses weren't *wrong*, they
  were outweighed, say so).
- **Prior decisions**, name every proposed option that a relevant ADR already rejected,
  cite the ADR by title, and state the specific new evidence that would justify reopening
  it. If no rejected option was proposed, say so explicitly.
- **Strongest dissent**, the best argument against the recommendation, kept visible so the
  user can overrule with eyes open. (Never bury the minority view.)
- **Confidence & what would change it**, how sure, and the fact/condition that would flip
  the call.
- **Next step**, the first concrete action.

When the panel is genuinely split with no dominant case, **say so and give the
decision rule** (e.g. "if reversibility matters most → A; if you won't revisit this for a
year → B") rather than forcing false certainty.

---

## Output

```markdown
## Council Verdict: {topic}

**Recommendation**: {one or two sentences, the single call}

### Grounding briefing
{the one distilled briefing, shown once}

### The panel
| Councillor | Position | Key point |
|---|---|---|
| Pragmatist | {for/against X} | {one line} |
| Architect | … | … |
| Skeptic | … | … |
| {…} | … | … |

### Where the panel converged
{the points all/most lenses agreed on}

### Live tradeoffs
{the genuine disagreements, stated as tradeoffs, not averaged away}

### Why this call
{the chairman's reasoning, tied to the decision axes}

### Prior decisions
{rejected options, ADR titles, and the evidence required to reopen each; or state that none
were proposed}

### Strongest dissent
{the best case against, kept visible}

### Confidence & next step
**Confidence**: {high/medium/low, and what would change it}
**Do first**: {the concrete next action}
```

---

## Guardrails: do NOT

- **Manufacture false balance.** If one option is clearly right, say so, don't invent a
  con to look even-handed.
- **Use this for external-fact questions.** Pricing / a vendor's current limits / "what's
  the best tool" needs fetched evidence → `/deep-research`. The council reasons; it doesn't
  research.
- **Implement anything.** This vets a decision; it writes no code.
