# Review & audit discipline

**At a glance:** 11 standing rules for `/pr-review`, `/audit-*`, `/commit-sweep`, `/prod-readiness`, and any fan-out assessment. Judgement-bound; none is gate-checkable. See `README.md` for the tier's contract.

## What a review is allowed to say

### 1. Never re-flag what a gate already enforces
State findings against what the repo **documents**, not against re-derived taste. If ESLint `local/*`, a `.claude/hooks/forbid-*` guard, or Roslyn `ORBIT0001`/`ORBIT0002` already fails on it, a reviewer repeating it is pure noise — the gate has it covered and the author will see it.

This is the natural-language companion to gates-over-prose, and it is first because it is the one most often broken.

### 2. Carry the Fowler smell baseline as the floor
Where the repo documents nothing, these still apply: **Mysterious Name, Duplicated Code, Feature Envy, Data Clumps, Primitive Obsession, Repeated Switches, Shotgun Surgery, Divergent Change, Speculative Generality, Message Chains, Middle Man, Refused Bequest.**

Label each as a judgement call. **A documented repo standard always overrides this list.** It names failure modes the 10 code standards do not (Feature Envy, Data Clumps, Shotgun Surgery, Divergent Change), which is why it earns a place — but `CLAUDE.md` stays supreme.

### 3. Separate the two axes; never merge or re-rank them
Review along **Standards** (does it follow the repo's documented rules?) and **Spec** (does it do what the originating issue asked?). Report them side by side, name the worst finding *within* each axis, and never pick a single cross-axis winner.

A change can pass one and fail the other. Merging them lets a clean-standards diff mask an implementation that built the wrong thing. (Recorded as a vault ADR; `/pr-review` runs five agents against one shared rubric, so the separation has to be deliberate.)

## Running a fan-out

### 4. Resolve the fixed point in the parent, before fanning out
Confirm the ref resolves and **the diff is non-empty** in the orchestrator. A bad ref or an empty diff must fail **once**, loudly, in the parent — not N times inside children who each confidently report "no findings."

An empty diff currently buys N clean reports, which is worse than an error because it looks like success.

### 5. A degraded run is a failed run, not a cheaper one
If an orchestrated review cannot run its assessments in isolated parallel sub-agents, **lead the report with an explicit degraded banner naming the reason**. A silent single-context fallback is not an acceptable substitute; it changes what the review is worth and the reader must know.

### 6. LLM judgement is recorded before detector output enters the context
In any review pairing human/LLM judgement with a deterministic detector, **finish and record the judgement first**. Deterministic findings anchor judgement even when they are correct — once you have seen the lint output, you review the lint output.

Ordering rule, stack-neutral. Complements the refutation-over-voting ADR rather than duplicating it.

### 7. Group findings; stop at ~50
Group by **rule ID and component family**, not one entry per instance. If a single pass returns more than ~50 violations, **stop and ask** rather than emitting the list. A 200-item report is not actionable, and nothing else currently caps finding volume.

## What a finding may claim

### 8. Never fabricate a `file:line`
Cite the selector verbatim. Attach `file:line` **only when the tool actually supplied a source mapping**; otherwise state plainly that the finding is located by selector only.

The audit skills mandate `file:line` evidence and never say what to do when the location is genuinely unavailable — which is exactly the pressure that invents a line number.

### 9. A clean detector result is not evidence of quality
Treat detector, lint, and automated-QA output as **defect evidence only**. A green script says defects of that class were not found; it says nothing about whether the surface is well designed.

This one exists to stop Orbit's own gates-over-prose culture from degrading into "the gates are green, so the design is fine."

### 10. A performance claim needs metric evidence for that surface
A recommendation must trace to an **observed metric for the specific route/surface**. A static-scan finding with no traffic evidence is supplementary only and is never ranked as a fix.

`/audit-performance` and `/profile` have no stated evidence bar, so a grep-derived "slow path" can otherwise be reported as fact.

## Fixing what an audit found

### 11. Split findings by fixability, and verify by re-running
Apply **mechanically-detectable** fixes verbatim. For **judgement-bound** ones (content clarity, screen-reader announcement quality, keyboard-flow coherence, complex visual contrast), leave a TODO naming the rule and flag for human review. **Never invent the content** — a fabricated alt text or label closes the finding and keeps the defect.

Then verify by **re-running the identical audit and diffing against the recorded baseline**: every targeted violation gone **and no new one introduced**. A fix pass that does not diff against a before-list has not verified anything. (This is the no-new-regressions half that global rule 5 omits.)
