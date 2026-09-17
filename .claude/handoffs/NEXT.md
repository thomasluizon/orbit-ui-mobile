# Fix the three-dot menu, then finish the prod release spec

Read `.claude/specs/orbit-prod-release.md` first, all of it. It is the living record: the standing
instructions in his words, the decisions, the constraints, the full state and every answer he has
given. Read `## The order` before anything else, and `## State` for where the work stands.

`.claude/specs/beta-release.md` is the record for work that ships off `main`. Read its constraints
once; they bite on any `main` work, and step 1 below is `main` work.

Read the brain notes the spec names, through the Obsidian MCP: `mcp__obsidian__obsidian_list_notes`,
then `mcp__obsidian__obsidian_get_note`. List `2 Areas/20-29 Orbit Engineering/Decisions/` and copy
the filenames that come back rather than the ones you remember. The MCP was UP on 2026-09-18 and
`obsidian_search_notes` needs `mode: "text"`.

## Entry point

`/sleep`. It enters `/orchestrate --sleep` itself. Do not treat them as two choices and do not
restate what either does.

## STEP 1, before anything else: the three-dot menu and the search input

**This is Thomas's own instruction, 2026-09-18, and it comes first.** His words:

> i want you to put as the first step on the handoff prompt, to research and understand this fucking
> bug of the three dot menu not opening, and the search input to behave correctly, forever.
> i literalaly just tested on the new mobile version, clicking the 3 dots on a habit, it doesnt open
> and sometimes it open, sometimes not

**Read this before you form a theory, because the last session got it wrong.** `#573`'s body quotes
him as saying the menu failed "after a search". **He never said that.** His correction, verbatim:

> 1. in some habits, for example, in the all habits tab, the 3 dots in the habit is simply not
> working, nothing happens, and it has nothing to do with the search
>
> 2. when clicking to search a habit, switching tabs (like from all to today) doenst close (and
> clear) the search, and clicking on the X doenst close the search input, i want both of these fixed
>
> why are you saying the dead three-dot tap is related to the search? i literally never said that

So there are **two separate defects**, and pull request 1011 fixed neither of them as he described.
1011 shipped a keyboard-tap theory, `keyboardShouldPersistTaps`, plus a `useTodaySearch` refactor.
That theory came from the ticket's misquote.

What is true on `main` right now, verified 2026-09-18:

- **The three-dot menu is still broken and it is INTERMITTENT.** "sometimes it open, sometimes not",
  on All habits, with no search involved. Intermittent is the most important word in this prompt: a
  fix that works once is not a fix, and a test that passes once has proven nothing.
- **Switching tabs DOES now close search.** `closeSearch()` fires on tab change in
  `apps/mobile/app/(tabs)/use-today-search.ts`. That half landed.
- **The X still does not close the search input.** Not fixed.

**One ticket for both**, by his instruction: "i want both, fixed in one ticket". He also said not to
file it during that session because it was bloated, so **filing it is step 1 of this one**.

How to run it:

1. **Research first, and do not guess.** Reproduce the intermittency or explain precisely why it
   cannot be reproduced in Vitest. Read `habit-row-trailing.tsx`, the row's press targets, the
   `Pressable` hit areas, anything that re-renders the row mid-press, and whether the menu's own
   open state is racing a list re-render. "Sometimes" usually means a race or a remount, not a
   missing prop.
2. **Never boot the emulator.** It is his visual testing surface. If the only honest answer is that
   a device is needed to confirm, build the correct fix, say so plainly in the pull request body,
   and move on. Device verification is not a gate on building something.
3. File ONE ticket covering both defects, with `/ticket`, then run it. It targets `main` under D99,
   because a person hits it in the shipped build today.
4. After it merges, `/android-release` to the open track on his standing permission.

## The goal

Finish `.claude/specs/orbit-prod-release.md`: an empty board and a production release. The order is
in that spec and it is not negotiable. Re-derive what is left rather than trusting any list:

    gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400
    gh pr list --repo thomasluizon/orbit-ui-mobile --state open
    gh pr list --repo thomasluizon/orbit-api --state open
    gh pr list --repo thomasluizon/orbit-landing-page --state open

**A blocker is the next piece of work, not an ending.** The only honest early ending is external:
the allowance runs out, the machine stops, or he says stop. Say which.

## THE REDESIGN GATE, and never ask about it again

Batch 1 closes when every `539 Redesign` screen ticket closes against its own acceptance criteria
AND `node tools/redesign-coverage.mjs` reports a valid mapping. Then: ship `redesign/main` to a
CLOSED Play INTERNAL track, tell him, and **STOP**. Do not merge. Waiting on him there is a
legitimate ending under `/sleep`, reported as blocked on his approval.

**2026-09-18, asked and answered for the last time:** "never ask me again about this. the gate is
setted, when the whole redesign is done, you build the internal build, i dont care how much screens
are missing". The number of remaining screens is never a reason to revisit the sequence.

Coverage is already GREEN at `c0556a1a`: `184 manifest surfaces accounted for, 14 deleted, 3
excluded`. The distance is the 16 open milestone tickets.

## The Astra rendering brainstorm, which he deferred to this session

`#318`. He answered its scope question and asked for the brainstorm here rather than in that session:

> astra rendering needs to be COMPLETELY refactored, using the beautiful ui.dev components, almost
> EVERYTHING that she renders need to be something VISUAL and beautiful, the only exception are
> simple sentences, idk, but everything else should be blockes, graphics, images, i dont know, we
> need to brainstorm this. NOT ON THIS SESSION THOUGH, ON THE HANDOFF.

The inventory is already on `#318`: about **60 chat capabilities, 3 of which render as a block**. The
component source is **`beautifului.dev`**; the `beautifui.dev` spelling in that body does not
resolve. `#318`'s `blockedBy` edge on `#36` is dead, because `#36` is closed. This is a conversation
with him, so under `--sleep` it waits; do the research that makes it cheap and put the options to
him when he is there.

## In flight, with a disposition on every row

Two Codex workers were ALIVE at handoff. **Read every worktree before assuming anything**: a finished
worker leaves commits, a dirty tree, or nothing, and each means something different.

| what | where | disposition |
|---|---|---|
| worker `#570` | `ticket-570-harness-gate`, log `orbit-workers\#570-1789677889900.log` | ALIVE. 16 unpushed commits, latest `1685c35c fix: reject untouched review evidence templates`. Outcome unknown. |
| worker `#67` | `ticket-67-onboarding`, log `orbit-workers\ORB-61-1789678195730.log` | ALIVE. 15 unpushed, 9 dirty. Round 4, five P1s. Outcome unknown. |
| **1001 uncommitted** | `ticket-562-weekday-import`, 4 files, ~100 insertions | **FINISH THIS FIRST among the pull requests.** `resolveCalendarSyncEndDate` maps `UNTIL` and `COUNT` to `endDate`, so a finite Google series stops instead of running forever. Green at 24 of 24, red-proven at 7. Interrupted before coverage and type-check. Commit, reply to `PRRT_kwDOR5Siws6jiJD6`, resolve, push. |
| 1014 | `#461` | APPROVED, zero reds, CI finishing. Merge when green. |
| 1012 | `#585` | Thread resolved. The parallelism measurement it lacked is now in the spec's State; put it in the body and request a review that can APPROVE. |
| 1010 | `#570` | Worker's. Base is already `redesign/main`; do not retarget it back. |
| 1007 | `#67` | Worker's. |
| 1002 | `#545` | Both threads resolved, pushed `60cd943d`. Awaiting review. |
| 992 | `#543` | Threads resolved. Its `Unit Tests` red is the 96 percent coverage floor; **merging 1001 fixes it**, so order those two. |
| api 528, 521 | `orbit-api` | Orders written this session but lost with the scratchpad. Re-derive from the threads. 521's `Dash Ban` is already cleared. |
| Dependabot | both repos | Leave. Not this effort. |
| `orbit-landing-page` | 5 open | Leave. Batch 3 owns that repository. |

No stashes, no detached HEADs, in any repository. `orbit-api` and `orbit-landing-page` checkouts are
clean.

## Five tickets verified UNBUILT, with the evidence already on each

Do not re-derive these; the measurements are on the tickets. `#460`, `#475`, `#479`, `#481`, `#520`.
`#520`'s finish line is machine-checkable: `node tools/check-surface-scope.mjs` stops naming the
navigation sites. `#475` carries a granted-canvas violation, the completed goal-detail ring drawn at
44 and built at 60.

## `--sleep`

Nobody is going to open this file, so do not stop after reading it. Read and execute
`.claude/skills/sleep/SKILL.md`, write run state under this session's own id, and leave a live wake
source before the turn ends. A worker launched by a previous session does not wake you: its wake
source belongs to that session. Own your own.

Take every decision yourself, always the best approach and never the easiest, and log each one.

## One more thing

Every identifier here came from a previous session. Treat each as a lead to verify, not a fact. The
last two sessions each had at least one confident claim that was wrong: a ticket that quoted Thomas
saying something he never said, and a merge refused because a sha was typed from memory instead of
copied from `gh pr view --json headRefOid`.
