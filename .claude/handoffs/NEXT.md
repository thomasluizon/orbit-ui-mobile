# Continue the Orbit redesign

Read `.claude/specs/orbit-redesign.md` first. It is the living spec and it holds everything durable:
the standing instructions, the decisions, the constraints, the full state and every answer Thomas has
given. This prompt only says what to do next.

`.claude/specs/beta-release.md` is the record for work that ships off `main`. It now covers TWO
releases, not one. Read its constraints once; they bite on any `main` work.

**Read the brain notes the spec names, before you act.** They are listed under
`## Decisions this effort runs on`, eighteen of them. All were confirmed present on 2026-09-16 at
23:38 through the `vault-fs` MCP, which returns frontmatter, so `status` and `superseded_by` were
checked rather than guessed and none is superseded. The **Obsidian MCP was still unreachable**
(`fetch failed`, Obsidian not running), which means backlinks were not read. Re-confirm through it
when it is up.

## Your entry point

`/orchestrate`. Do not restate what it does; work through it.

## The goal

**Finish `.claude/specs/orbit-redesign.md`.** The run ends when every screen ticket is closed and
`node tools/redesign-coverage.mjs` reports a valid mapping with nothing missing. That command is
necessary and NOT sufficient: it validates the MAPPING, never whether a surface satisfies its ticket,
and it reads a manifest no CI job regenerates. Judge every ticket against its own acceptance criteria,
in the tree, before closing it.

A blocker is the next piece of work, not an ending. Re-derive what is left:

    gh issue list --repo thomasluizon/orbit-tickets --state open --label "repo:ui" --limit 300
    gh pr list --repo thomasluizon/orbit-ui-mobile --state open
    gh pr list --repo thomasluizon/orbit-api --state open

131 carried `repo:ui` and 67 carried `repo:api` at 23:40 on 2026-09-16.

## Read this before you merge anything

**An APPROVED Pullfrog review is not the verdict.** A later review of the SAME head can supersede it,
and `list-bot-threads.mjs --re-review` returns on the first one. It happened **four times** in one
evening, on 992, 986, 994 and `orbit-api` 521, and every superseding review carried a real defect:
arrow keys selecting the wrong timezone, a web link opening a habit behind two modal overlays, and an
explicit sign-out being undone by a refresh already in flight.

Decide every merge on **the LAST Pullfrog review of the exact head being APPROVED AND the newest
`pullfrog-approval` check run at that head concluding `success`**, ignoring SonarCloud only when the
base is `redesign/main`. A scratch tool that does exactly that read lives at
`<previous session scratchpad>/mergecheck.mjs`; it is gone with that session, so rebuild it in five
minutes or do the two reads by hand. The measurements are recorded on `#541`.

## In flight, with a disposition on every row

**Six UI pull requests and two `orbit-api` ones are open. Two workers were RUNNING at handoff time.**

| PR | repo | head | disposition |
|---|---|---|---|
| 984 | ui | `1b7b7aeb` | **MERGE IT FIRST.** Every condition was met at 23:40: last review APPROVED at the head, `pullfrog-approval` success, checks green, zero unresolved threads. Re-verify the head, then merge |
| 986 | ui | `0cf33267` | round 5 landed the web owner-close fix, and the newest review of that head is **CHANGES_REQUESTED and UNREAD**. Read it from scratch |
| 994 | ui | `9d9d0665` | round 8 pushed and its thread resolved. Review and CI were in flight. This one has taken 8 rounds; if round 9 opens another concurrency finding, the model is still wrong |
| 992 | ui | `a559477e` | round 4 plus a merge-forward pushed. Needs a fresh review of that head |
| 991 | ui | `b604fb54` | **WORKER RUNNING** in `C:\Users\thoma\orca\workspaces\orbit-ui-mobile\ticket-560-sweep-order`, branch `chore/ticket-560-sweep-order`, log `%TEMP%\orbit-workers\#560-1789583118751.log`. Outcome UNKNOWN. Read the worktree first |
| 970 | ui | `52974481` | **WORKER RUNNING** in `C:\Users\thoma\orca\workspaces\orbit-ui-mobile\ticket-541-progress-generic`, branch `chore/progress-generic-full`, log `%TEMP%\orbit-workers\#558-1789583470224.log`. Outcome UNKNOWN. Read the worktree first |
| 521 | api | `ff892dc6` | round 4's order is POSTED and says to REMOVE the recurrence half entirely. Not started |
| 520 | api | `b74178ba` | round 4's order is POSTED: two fields, `planRequirement` and `quotaLiftedByPlan`. Not started |
| Dependabot | both | ui 798/799/801/881, api 510/525/526 | Leave. Not this effort |

**A killed or stopped worker has usually COMMITTED.** Read the worktree before assuming loss.

## Do this, in this order

1. **Merge 984**, then drive 986, 994 and 992 to merge. Read the two running workers' worktrees first,
   because their result lands nowhere else.
2. **The two `orbit-api` rounds**, then merge and deploy both.
3. **`#529`**, now fully specified and answered. Gate BOTH listing and revoking behind the emailed
   code. **The switch is the part that matters**: `AppConfigKeys.RequireApiKeyCreationStepUp` defaults
   to `false`, so it must be flipped to true in `AppConfigs` AFTER the deploy or the ticket ships
   inert. His answer and the orchestrator brief are both comments on it.
4. **`#561`**, eight Android sheets that navigate while presented. The order is posted and the
   worktree is cut at `0600332b` on `fix/ticket-561-sheet-nav`. Just launch it.
5. **`#562`**, filed tonight: a weekday-scoped calendar event has NEVER imported, on any shipped
   build, because the client sends `days` with a weekly unit and `HabitInvariants.cs:42-43` rejects
   that. High severity, and its interval and ordinal cases are already decided as visible refusals.
6. **`#545` stages 2 to 5**, 77 suppressions. Its reconciliation comment proves nothing is ownerless,
   so do not file another ticket for the shared primitives.
7. **The seven remaining screen tickets**: `#63`, `#67`, `#73`, `#76`, `#329`, `#57`, `#58`.

## Four things that cost real work

- **The local worker cap is TWO.** Do not run a root type-check or a vitest suite while two are up.
- **`npx turbo run type-check --force`** when the result is evidence, and say it was forced.
- **A `parity:exempt` label does not retro-fix a run already created.** A `Cross-Platform Parity` run
  created before the label carries a payload without it and fails; the run the label triggers skips
  correctly. Both 998 and 999 hit it. Fire a fresh `pull_request` event by editing the body.
- **`--match-head-commit` needs the FULL sha**, and never `git worktree remove --force` on Windows.

## State of the tree

`redesign/main` is `4d49d718`, **296 commits ahead of `main`**. `main` is `a9558f7a` and **1.3.29 (88)
was released to the Play open track tonight**, run `35134831975`, carrying the checklist fixes.

183 worktrees in ui and 20 in api, four stashes in ui. Seven dirty trees, none holding unmerged work
except `ticket-560-sweep-order`, which has a running worker in it. The spec's State section lists
them with counts.

## `--sleep`

Thomas ran `/wrap-up --sleep`. Nobody is going to open this file, so do not stop after reading it.
Read and execute `.claude/skills/sleep/SKILL.md`, write run state under this session's own id, and
leave a live wake source before the turn ends. Take every decision yourself, always the best approach
and never the easiest, and log each one.

## One more thing

Every identifier above came from a previous session. Treat each as a lead to verify, not a fact.
