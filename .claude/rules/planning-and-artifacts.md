# Planning, specs & artifacts

**At a glance:** 11 standing rules for `/create-prd`, `/create-stories`, `/plan`, `/drive`, prototyping, ADRs, and session handoff. Judgement-bound; none is gate-checkable. See `README.md` for the tier's contract.

## What goes in a document

### 1. Keep file paths and code snippets out of issue bodies and specs
They go stale within days and then get cited as authority.

**The one exception:** a snippet that encodes a decision more precisely than prose can — a state machine, a reducer, a schema, a type shape. Inline it in the decision it belongs to, trimmed to the decision-rich part.

This is a failure mode Orbit has already paid for: `CLAUDE.md` records that repo-local research dossiers were deleted because they "go stale silently and then get cited as authority." The same reasoning governs what `/create-prd` and `/create-stories` emit.

### 2. Size the artifact to the clarity of its inputs
When discovery was crisp, **a 3-5 bullet brief *is* the deliverable.** Do not pad it into a long structured document to look thorough.

A document that restates answers the user just gave is noise, not rigor. Global rule 3 (Simplicity first) covers code; this covers what agents write.

### 3. Assert the obvious option; do not offer a menu you know the answer to
When the context already makes one option obvious, **state it and ask for confirmation or override**. *"This reads as X, confirm?"* beats a four-option `AskUserQuestion`.

**Never list an open question you would immediately annotate with "Recommend: X"** — decide X, state the default, and move on. An **Open Questions** section holds only genuinely unresolved forks.

Reinforces the standing "do all in-scope work, questions only for true forks" correction, which otherwise lives only in per-project memory.

## What earns a ticket

### 4. The ticket-vs-fog test is precision *now*, not answerability now
Ticket a sharp question **even when it is blocked**. Anything you cannot phrase sharply stays as coarse **"not yet specified" fog** — do not pre-slice fog into speculative tickets.

`/drive`'s living spec survives `/clear` but carries no rule for what earns a ticket versus what stays unspecified.

### 5. A wide refactor is the exception to vertical slicing
One mechanical change whose blast radius fans across the codebase gets sequenced **expand → migrate in blast-radius-sized batches → contract.** Each batch is its own ticket, blocked by the expand, so **CI stays green batch to batch**.

`CLAUDE.md` mandates expand-contract for shared/DTO **contract** changes; this generalizes it to any wide mechanical refactor.

### 6. Scope an architecture pass by recent change
Weight the codebase's hot spots before scanning — walk `git log --oneline` for the files that keep coming up. Deepening only pays off where future changes will land.

A YAGNI gate on refactor scope, directly relevant to `/thermo-nuclear-code-quality-review` and `/audit-code-quality`, which scan whole repos with no recency weighting.

## ADRs

### 7. Three conditions, all required
Write an ADR **only when all three are true**:

1. the decision is **hard to reverse**,
2. it would be **surprising to a future reader** without context,
3. it is the result of a **real trade-off with genuine alternatives**.

If any is missing, skip the ADR.

The vault and `/brain-decide` define the template and the filing mechanics but never a **threshold**. This is the cheapest guard against ADR sprawl diluting the Decisions folder that `hot.md` reads as the standing record.

## Prototypes

### 8. A prototype answers exactly one named question
Name the question **before writing it**. The question decides the shape:

- *"does this state model feel right"* → a tiny interactive terminal app;
- *"what should this look like"* → several radically different variants on one route, switchable by a URL search param.

If you had to guess at anything, **state the assumption at the top**.

Stack-neutral, and absent from `WORKFLOW.md`, whose paths all assume the diff is known. This is the path for when it is not.

### 9. Prototype code is throwaway from day one
Located next to what it prototypes. Named so a reader sees it is a prototype. **No persistence, no tests, no error handling beyond runnability, no abstractions, one command to run.**

This is the one context where "every feature needs behavior tests" and the no-dead-code standards are explicitly suspended. Saying so prevents a prototype from being either over-built or quietly hardened into production code.

### 10. Main keeps only the decision
When a prototype has answered its question: fold the validated decision into the real code, **commit the prototype to a throwaway branch off main**, and leave a pointer to that branch plus the verdict on the implementation issue.

Same instinct as the 2026-07-16 decision to delete `research.md` and route knowledge to the vault. It gives prototypes a disposal path instead of leaving them to rot in main.

## Sessions

### 11. `/handoff` forks, `/compact` continues
**Compact only at an intentional break between phases, never mid-phase.** Fork to a fresh session via a handoff file when verbatim history must survive.

Do not push a session past the point where reasoning degrades (~120k-token working window) — **hand off instead**. A degraded window is a reason to stop, not to continue more carefully.

Orbit ships `/handoff` but nothing stated when to fork versus compact.
