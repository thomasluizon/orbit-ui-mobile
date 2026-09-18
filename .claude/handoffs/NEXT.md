# Finish the prod release spec

Read `.claude/specs/orbit-prod-release.md` first, all of it. It is the living record: the standing
instructions in his words, the decisions, the constraints, the full state and every answer he has
given. Read `## The order` before anything else, then `## State`.

`.claude/specs/beta-release.md` is the record for work that ships off `main`. Read its constraints
once; they bite on anything targeting `main`, which pull request 1015 does.

Read the brain notes the spec names through the Obsidian MCP: `mcp__obsidian__obsidian_list_notes`,
then `mcp__obsidian__obsidian_get_note`. List `2 Areas/20-29 Orbit Engineering/Decisions/` and copy
the filenames that come back rather than the ones you remember. **The MCP was UP on 2026-09-18 at
00:30** and all nineteen notes the spec names were confirmed present; `obsidian_search_notes` needs
`mode: "text"`.

## Entry point

`/sleep`. It enters `/orchestrate --sleep` itself. Do not treat them as two choices and do not
restate what either does.

## The goal

Finish `.claude/specs/orbit-prod-release.md`: an empty board and a production release. The order is
in that spec and it is not negotiable. Re-derive what is left rather than trusting any list:

    gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400
    gh issue list --repo thomasluizon/orbit-tickets --state open --milestone "539 Redesign" --limit 400
    gh pr list --repo thomasluizon/orbit-ui-mobile --state open
    gh pr list --repo thomasluizon/orbit-api --state open
    gh pr list --repo thomasluizon/orbit-landing-page --state open

**A blocker is the next piece of work, not an ending.**

## A killed worker is a relaunch, never an ending

**Thomas, 2026-09-18, after a session reported the night over because the host reaped two workers for
system memory:**

> wrong. the night doesnt end here. if you have any problem with the worker, just launch another one.

A harness kill, a host kill, a hard ceiling and `ERROR: Selected model is at capacity` are all the
same thing: launch another worker. Read the worktree first, because a killed worker has usually
COMMITTED, and check WHAT is dirty rather than whether anything is: two modified files that turn out
to be `widget-header.test.ts.snap` and `theme.test.ts.snap` are the CLEAN case, because both flip
their own line endings. The only endings are the allowance running out and him saying stop.

## First: pull request 1015, the live Android defect

`#590`, against `main` under D99, and it is the fix for the three-dot menu he has reported since
`#134`. The root cause is proven from installed source and written up in the spec under
`### The three-dot defect, solved`. **Read that before forming any theory**, and do not re-chase
`removeClippedSubviews` or a drag gesture; both are ruled out there with the source that rules them
out.

It is BLOCKED on one real P1, and Pullfrog is right:

- Thread `PRRT_kwDOR5Siws6ji8aZ`, `apps/mobile/app/(tabs)/use-today-search.ts:22`. The new
  `Keyboard.dismiss()` is reachable **during React render**, because `useTodayViewSync` calls
  `closeSearch` while rendering active-view and pinned-date changes. Move it to a committed
  lifecycle or event path.
- `Cross-Platform Parity` is red. `parity:exempt` is applied but the failing run predates the label,
  so fire a fresh `pull_request` event with a body edit. That red is the trap, not a finding.

**After it merges, `/android-release` to the OPEN track on his standing permission.** He wrote it and
that is the authorization; do not ask again.

## In flight, with a disposition on every row

No stashes, no detached HEADs, no dirty worktrees, in any repository. `orbit-api` and
`orbit-landing-page` are clean. One unpushed commit exists, `1890341c` in `ticket-58-achievements`,
and it is the pre-squash form of merged pull request 1014, so it is disposable.

| what | where | disposition |
|---|---|---|
| worker `#475` | `ticket-475-goal-grant`, log `orbit-workers\#475-1789689547628.log` | ALIVE at handoff, running the step 6 sweep for 1017. Outcome unknown. Read the worktree. |
| 1015 | `#590`, base `main` | The P1 above. **Do this first.** |
| 1018 | `#481` | Sweep DONE, head `3da49c08`. Needs a review. |
| 1017 | `#475` | The live worker's. |
| 1016 | `#520` | Acceptance verified: navigation findings 12 to 0. **Owes its step 6 sweep**, then a review. |
| 1007 | `#67` | Head `8e297420`, all five P1s answered. Needs a fresh review. |
| 1002 | `#545` | Threads resolved at `60cd943d`. Needs a review that can approve. |
| 1001 | `#562` | Head `954c6279`, its P1 resolved, coverage 96.36 percent. **Merge it before 992**, because that clears 992's red. |
| 992 | `#543` | Head `e818a478`. Its `Unit Tests` red IS 1001's coverage floor. |
| api 528, 521 | `orbit-api` | Orders lost with an earlier scratchpad. Re-derive from the threads. 521's `Dash Ban` is cleared. |
| `#460`, `#479` | tickets | The last two verified-unbuilt redesign tickets. `#460` already has a worktree with dependencies installed at `ticket-460-notify-announce`, branch `fix/ticket-460-notify-announce`, no commits. |
| Dependabot | both repos | Leave. Not this effort. |
| `orbit-landing-page` | 5 open | Leave. Batch 3 owns that repository. |

**1017 and 1018 deliberately shipped without a `## Review harness` block**, because their workers
were stopped before step 6 and a line claiming a review nobody ran is forbidden. 1018's sweep has
since run; 1016 and 1017 still owe theirs. A red `Redesign Review Harness` on those is the gate
working.

## Then: the order

1. 1015, above.
2. Merge 1001, then 992. Drive 1002, 1007, 1016, 1017, 1018 to approved and merge them.
3. `#460` and `#479`, the last two unbuilt redesign tickets.
4. `#545` and `#543` close out the suppressions; `#175` unblocks when they reach zero, `#217` when
   `#67` lands.
5. Then the redesign gate below.

## THE REDESIGN GATE, and never ask about it again

Batch 1 closes when every `539 Redesign` screen ticket closes against its own acceptance criteria
AND `node tools/redesign-coverage.mjs` reports a valid mapping. Then: ship `redesign/main` to a
CLOSED Play INTERNAL track, tell him, and **STOP**. Do not merge. Waiting on him there is a
legitimate ending under `/sleep`, reported as blocked on his approval.

**2026-09-18, asked and answered for the last time:** "never ask me again about this. the gate is
setted, when the whole redesign is done, you build the internal build, i dont care how much screens
are missing."

Coverage is already GREEN at `63e8774d`: `184 manifest surfaces accounted for, 14 deleted, 3
excluded`. The distance is the 15 open milestone tickets.

## The Astra rendering brainstorm, still owed

`#318`. His words are in the spec's standing instructions. The inventory is on the ticket: about
**60 chat capabilities, 3 of which render as a block**. The component source is **`beautifului.dev`**;
the `beautifui.dev` spelling does not resolve. This is a conversation with him, so under `--sleep` it
waits; do the research that makes it cheap and put the options to him when he is there.

## `--sleep`

Nobody is going to open this file, so do not stop after reading it. Read and execute
`.claude/skills/sleep/SKILL.md`, write run state under this session's own id, and leave a live wake
source before the turn ends. A worker launched by a previous session does not wake you: its wake
source belongs to that session. Own your own.

Take every decision yourself, always the best approach and never the easiest, and log each one.

## One more thing

Every identifier here came from a previous session. Treat each as a lead to verify, not a fact. Two
misreads happened in one night and both were summaries rather than sources: a ticket body that quoted
Thomas saying something he never said, and a review finding judged from its one-line title when its
body said something else. **Open the thread body and the tree, never the paraphrase.**
