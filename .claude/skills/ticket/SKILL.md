---
name: ticket
description: Anything needing work in, 1..N executable Linear tickets out, whether a bug, defect, chore, improvement, task, docs change, idea, a whole feature, or several problems listed at once. How many tickets is decided by the analysis, never asked of you up front. One approval gate before anything is created. Writes no code and fixes nothing; /orchestrate picks the tickets up.
argument-hint: <a bug, an idea, a chore, a task, a docs change, a whole feature, or a list of several problems>
effort: high
---

# /ticket: anything in, 1..N Linear tickets out

The ticket is the prompt (D2): a ticket a fresh agent with no session history cannot execute is a
defective ticket. This skill makes defective tickets impossible to create.

**Cardinality is an OUTPUT of phase B, not an input Thomas has to know before typing.** One request
can be one ticket or eight. Never tell him to quit and retype a different command; decide the count
yourself and show him the split at phase D.

D1 scope: Linear covers orbit-ui-mobile (`repo:ui`) and orbit-api (`repo:api`) only; for
orbit-landing-page, infra, or Dependabot work, stop before drafting and say GitHub Issues owns it.
Constants: orca at `C:\Users\thoma\AppData\Local\Programs\orca\resources\bin\orca`, team `ORB`.

## A. Grill

Invoke the `grilling` skill and follow it: one question at a time, each carrying your recommended
answer, until you reach shared understanding. Look every *fact* up yourself (`architecture.json`,
`DESIGN.md`, the filesystem, the Sentry / Render / read-only postgres MCPs); only *decisions* go to
Thomas, and never ask him to paste what a tool can fetch. Do NOT batch every fork into one
AskUserQuestion: it cannot do the facts/decisions split plus a confirmation gate. Create nothing
until he confirms the understanding is shared.

**Defect path.** If any part of the request is a defect, run the `diagnosing-bugs` skill phases 1
and 2 BEFORE that ticket exists: a red-capable command you have already run at least once,
deterministic, fast, asserting the exact symptom, then minimised. This binds to a bug found inside a
feature request too, not only to a request that arrives labelled as a defect. The command and its
output go first in that ticket's Test scenarios, marked as the red case that must turn green. If a
loop genuinely cannot be built, say so with the literal phrase "unreproduced, evidence below" and
attach the Sentry issue, Render logs, or DB rows you pulled. **Every non-defect explicitly omits the red repro**: its
Test scenarios prove the new or changed behaviour, and no fabricated red case belongs there.

## B. product-manager: how many tickets

1. Spawn `product-manager` with the raw request plus `architecture.json`. It returns the sharpened
   problem, the affected surfaces and endpoints, the per-ticket 6.2 material, and a first-cut split.
2. Spawn `design-specialist` in parallel whenever any surface is user-visible. For a pure chore or
   harness item with no UI, state that it was skipped and why.
3. **Splitting one message that lists several problems.** Decide which of these three shapes each
   cluster is, and record the reason for phase D:
   - **Several unrelated problems** produce N independent tickets and **no `blockedBy` edges between
     them**. Arriving in the same message is not a dependency. Do not manufacture one just because
     they were typed together.
   - **Several symptoms of one root cause** produce **ONE ticket naming the root cause**, with the
     symptoms listed under Problem as evidence. **Splitting by symptom is the common failure and it
     produces N tickets that each half-fix the same thing**, each landing a partial patch that
     leaves the real defect alive. Symptoms that share a repro share a ticket.
   - **Several problems with a real ordering** (one must ship before another can be built) produce N
     tickets **with `blockedBy` edges**. Cross-repo work is always an api ticket blocking a ui
     ticket (D4), which encodes deploy-API-first as a DAG edge. `repo:both` does not exist.

## C. Scope

Read and execute `.claude/skills/_shared/scope-completeness.md`. Produce ONE list for the whole
request, assign every entry to exactly one ticket or mark it out of scope with a reason, and copy
each ticket's entries into its Scope and Affected modules / files. Cover both repos when relevant:
`orbit-api` is a sibling repo with its own git history, branches, and PRs.

## D. ONE approval gate

Nothing exists in Linear yet, and nothing is created until Thomas approves. This gate is the
validation; no ticket-linting script runs here. In ONE message show him:

- **The split**: the ticket count, each ticket's one-line title, and the `blockedBy` edges.
- **The reason for every split and every merge decision**, one line each: "these three are symptoms
  of one root cause, so one ticket", "these two are unrelated, so no edge", "the api change must
  deploy first, so it blocks the ui ticket".
- Per ticket: repo label, type label with its reason, parity label, `visible-effect`, and the full
  drafted body (scratchpad file).
- The project decision from phase E step 1: named, new or existing, with its reason.

Then ask for approval with ONE AskUserQuestion whose FIRST question is the split (the alternative
split as the second option) and whose second is the project decision, so neither is something this
skill decided quietly. **He can correct the split here**; an edit loops back through B or C and
returns to this gate.

Every body carries the 6.2 sections: Problem/why, Scope, Out of scope, Expected behaviour,
Technical details, Affected modules / files, Acceptance criteria, Test scenarios, plus
Rollout/kill-switch and Events/metrics where risk or measurement exists. Standing rules, each one a
defect if violated:

- One ticket = one repo = one coherent, independently mergeable PR. Normally design small tickets
  that a reviewer can understand in one sitting, and split separable behavior or deployment
  boundaries. File and line estimates are planning signals, never correctness or delivery rules.
- Estimate mandatory generated artifacts as part of the ticket: architecture artifacts with their
  route/module source, EF migrations and generated Designer output with the model change, generated
  contracts with their schema, and required lockfiles or codemod output. Never split those artifacts
  away from the change that requires them.
- Do not split one atomic behavior merely to satisfy a numeric threshold. Arbitrary splits must not
  produce incomplete behavior, temporary bypasses, broken drift gates, unused foundations, or a
  migration detached from its model change.
- Exactly one `repo:*` label and exactly one type: `Bug` where current behaviour contradicts
  intended behaviour, `Feature` for a new user or system capability, `Improvement` for a chore,
  refactor, tooling task, or docs task. Never infer the type silently.
- ui tickets carry `parity:yes` (web + mobile in one PR) or `parity:no` with its platform-adapter
  justification; `visible-effect` whenever pixels change, with the D7 contract in the body (final
  screenshots and the critique artifact on the Linear issue before In Review).
- Never a tests-only ticket, a "foundation" ticket of unused functions, or a migration split from
  the feature it serves. Dependencies are explicit relations; "after X lands" in prose is not one.
- Shared/DTO changes are append-only and deploy-API-first; say so in the api ticket.
- Defects put severity and blast radius in Problem; root-cause hypotheses go in Technical details,
  labelled as hypotheses.

## E. Create

1. **Resolve the project, never by default.** `orca linear project list` is the current set. Route
   into an existing project whose scope the work extends (a redesign ticket into `539 Redesign`, an
   Astra ticket into `562 Astra`, a launch blocker into `Launch`), and into `Backlog` when none
   fits, including tech debt. **Mint a new project ONLY when the work is 3+ tickets AND carries
   either an internal DAG or locked decisions every ticket must honour**; that content document is
   what a project buys, and without one a project is a label with extra steps. Never one for a
   single ticket. Every ticket needs a project, or it is created and then never picked up.
2. Only for a NEW project, the one Linear write orca has no command for: read
   `$env:USERPROFILE\.linear-api-key` (never echo it) and POST https://api.linear.app/graphql with
   header `Authorization: <key>`, calling `projectCreate(input: { name, teamIds: ["<ORB team id>"],
   description })` then `projectUpdate(id, input: { content: "<locked decisions, verbatim>" })`.
   Linear hard-caps `description` at 255 chars, so the substance lives in content.
3. Create each issue with the Linear MCP (`save_issue`) or `orca linear create --title "<t>"
   --body-file - --team ORB --project "<name>" --state Todo --label "<repo:*>" --label "<type>"
   [--label "<parity:*>"]`. Every issue write goes through one of those two: the
   `forbid-raw-linear-mutation` hook blocks a raw GraphQL `issueCreate` at act time.
4. `orca linear relation add ORB-A --related ORB-B --type blocked-by` for each edge approved at
   phase D, and only those.
5. Print the final table: identifier, title, repo, type, `blockedBy`. When tickets landed in an
   existing project, say which rows are the new ones.

Stop there. No code, no branches, no worktrees, no fixing even for a one-liner: the output is
tickets, and the ticket is the record that makes the work reviewable. `/orchestrate ORB-N` builds
what this creates.
