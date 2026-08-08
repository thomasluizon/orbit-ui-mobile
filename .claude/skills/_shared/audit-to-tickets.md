# Audit output is GitHub tickets (D10), never a report

**At a glance:** the shared synthesis contract for every `/audit-*` and `/prod-readiness`
run. A report is a photograph that starts lying the day after it is written (D10); the
durable output of an audit is a set of executable GitHub tickets, gated by one human
approval. This is the single copy of that pipeline so the five skills cannot drift. Every
ticket satisfies the same 6.2 template `/ticket` applies and follows the same
rules `/ticket` does.

The private tracker is `thomasluizon/orbit-tickets`. Read
`.claude/playbooks/planning-and-artifacts.md` for the ticket-writing rules if you have not written
a 6.2 ticket before.

## 1. Draft one ticket per verified finding

The workflow already dropped every refuted finding and, per D11, every gate-owned concern,
so the surviving set is small and judgement-only. For each survivor, draft a body to the
scratchpad mapping the finding onto the 6.2 sections:

| 6.2 section | From the finding |
|---|---|
| Problem / why it matters | `title` + `rationale` (the threat / scaling impact / what a break would not catch) + severity and blast radius |
| Scope | the single fix this ticket delivers |
| Out of scope | what the ticket deliberately leaves; name the gate-owned concerns excluded per D11 |
| Expected behaviour | the post-fix state |
| Technical details | `evidence` (the file:line and the code that proves it) + the approach from `fix` |
| Affected modules / files | `location` |
| Acceptance criteria | at least two checkable items derived from `fix` |
| Test scenarios | the test that proves the fix (for a tests-audit finding, `fix` already IS the concrete test) |

Fold findings that share a single fix and PR into one ticket (D4: one ticket = one coherent,
independently mergeable PR). Prefer a small review surface when behavior is genuinely separable,
but treat file and line counts as advisory planning signals. Never split one atomic fix or its
mandatory generated artifacts across tickets merely to satisfy a number.

## 2. Label and wire the DAG

- Exactly one `repo:*`, derived from `location`: `orbit-ui-mobile` -> `repo:ui`, `orbit-api`
  -> `repo:api`, the landing repo -> `repo:landing`. `repo:both` does not exist; cross-repo
  work is an api ticket that BLOCKS a ui ticket (D4), the api fix deploying first.
- Exactly one type label: `Bug` for a verified defect where current behaviour
  contradicts intended behaviour, `Feature` for a new user or system capability, or
  `Improvement` for hardening, a chore, an enhancement to existing behaviour, refactoring,
  tooling, tests, or docs. State the chosen type and why before the approval gate; never
  infer it silently.
- `repo:ui` tickets declare `parity:yes` (web + mobile in one PR) or `parity:no` with the
  adapter-only justification in the body.
- blockedBy is an explicit relation, never prose: a ui perf fix that needs an api index first
  is a ui ticket blockedBy the api ticket.

## 3. Validate every draft

Re-read the draft against the 6.2 template; fix until it is complete. No em/en dashes (banned
everywhere), no TBD/TODO, at least two acceptance criteria.

## 4. HARD GATE: one human approval before anything exists in the ticket tracker

Mirror /ticket phase D. In ONE message show Thomas:

- the ticket table: title, repo label, type label and reason, parity, severity, blockedBy;
- the audit provenance so he approves with eyes open: coverage (surfaces swept), the Deferred
  ledger (in-scope-but-not-verdicted, verify-cap overflow), and the convergence state. If
  `converged !== true`, say "coverage UNKNOWN, <convergenceReason>"; a dead verifier is never
  a clean pass.

Then ask for explicit approval via ONE AskUserQuestion call. Nothing is created in the tracker
until he approves. An edit request loops back to step 1 and re-validation, then this gate
again. The skill NEVER auto-creates tickets unattended.

This provenance is shown here and persisted nowhere: it is not written to a report file (that
is the photograph D10 kills).

## 5. Create and re-validate

On approval:

1. Apply `/ticket` phase E milestone rules. List existing milestone titles first. Assign one when
   the audit extends a real body of work; holding-pen findings get no milestone.
2. Use `gh issue create --repo thomasluizon/orbit-tickets --title "<title>" --body-file <draft>
   --label <repo:*> --label <Feature|Bug|Improvement> [--label <parity:*> ...] --project Orbit
   [--milestone "<existing title>"]` per ticket.
3. Set each created board item to Status Todo with `gh project item-edit 2 --owner thomasluizon
   --url <created-issue-url> --field Status --value Todo`.
4. Add every approved `blockedBy` edge with `gh issue edit <ticket-number>
   --repo thomasluizon/orbit-tickets --add-blocked-by <blocker-number>`.
5. Re-read each created issue against the template, labels, board Status, milestone, and relations.
6. Print the final table: issue reference, title, repo, type, milestone or `none`, and blockedBy.

If the run produced zero in-scope findings, create nothing: report "clean: no judgement-level
findings; the mechanical layer is gate-owned" and stop.
