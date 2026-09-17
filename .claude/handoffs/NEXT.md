# Finish the Orbit redesign

Read `.claude/specs/orbit-redesign.md` first. It is the living spec and it holds everything durable:
the standing instructions, the decisions, the constraints, the full state and every answer Thomas has
given. This prompt only says what to do next.

`.claude/specs/beta-release.md` is the record for work that ships off `main`, and it covers TWO
releases. Read its constraints once; they bite on any `main` work.

**Read the brain notes the spec names before you act.** They are listed under
`## Decisions this effort runs on`, eighteen of them. On 2026-09-16 all three vault MCPs failed to
connect (`obsidian`, `vault-fs` and `circleci`, all `CONNECT_TIMEOUT`), so the check fell back to
reading frontmatter on disk: every one reads `status: accepted`, and a scan of
`^superseded_by: *[^ ]` across the whole `Decisions/` directory returned exactly ONE non-empty value,
on `Cap Codex worker parallelism at two while Thomas is at the machine.md`, which is not one of the
eighteen. **Backlinks were not read. Re-confirm through the Obsidian MCP when it is up.**

## Your entry point

`/sleep`. It enters `/orchestrate --sleep` itself, so do not treat them as two choices. Do not
restate what either one does; work through them.

## The goal

**Finish `.claude/specs/orbit-redesign.md`.** The run ends when every screen ticket is closed and
`node tools/redesign-coverage.mjs` reports a valid mapping with nothing missing. That command is
necessary and NOT sufficient: it reported `valid: 184 manifest surfaces accounted for, 14 deleted, 3
excluded` on 2026-09-16 while seven screen tickets were still open. It validates the MAPPING only,
and it reads a manifest no CI job regenerates. Judge every ticket against its own acceptance criteria
in the tree before closing it.

A blocker is the next piece of work, not an ending. Re-derive what is left:

    gh issue list --repo thomasluizon/orbit-tickets --state open --label "repo:ui" --limit 300
    gh pr list --repo thomasluizon/orbit-ui-mobile --state open
    gh pr list --repo thomasluizon/orbit-api --state open

## Read this before you merge anything

**An APPROVED Pullfrog review is not the verdict.** A later review of the SAME head supersedes it,
and `list-bot-threads.mjs --re-review` returns on the first one.

Decide every merge on **the LAST Pullfrog review of the exact head being APPROVED AND the newest
`pullfrog-approval` check run at that head concluding `success`**, ignoring SonarCloud only when the
base is `redesign/main`. That condition merged 984 and 986 cleanly on 2026-09-16 and refused four
others that looked ready. **Rebuild the tool that does exactly that read**; it lives in a scratchpad
that dies with its session, and it is about five minutes of work. Read it as four parts: last bot
review at head, newest check run per NAME, unresolved bot threads, and reds excluding SonarCloud.

Two cheap things that save real time:

- `node tools/list-bot-threads.mjs --pr <n> --repo <key> --no-request --wait-seconds 0` is the read.
  Without those flags it posts `@pullfrog review` and waits up to fifteen minutes.
- That tool RECORDS every thread id it prints, which is what clears
  `forbid-invented-identifier.mjs`. An id read through raw GraphQL is refused even when it is
  correct. The gate is right; do not work around it.

## In flight, with a disposition on every row

**Four UI pull requests and two `orbit-api` ones are open. No worker is running: Thomas said "stop
all the work" and every one was stopped deliberately.**

| PR | repo | head | disposition |
|---|---|---|---|
| 994 | ui | `1b502877` | round 11. `auth-store.ts:289`: the token refresh advances `sessionGeneration` while `login()` awaits cleanup, so the login owner fails its next generation check and returns before its only `signed-in` publication. Same model, one more writer outside it. **Finish the model, never guard it from outside** |
| 992 | ui | `0cbcd183` | `radio-group.tsx:52`: every enabled radio is focusable now, so forward focus has no route to the CHECKED item, lands on an unchecked one, and `onFocus` selects it. Traversal alone changes the value. Decide the entry route |
| 991 | ui | `9b806654` | `compose-prompt.mjs:146`: the order makes `.truncated` and `.tree[].type` load-bearing GitHub API fields with no recorded invocation or typed response shape in the body. Same class the `gh --json` proof closed on 970 |
| 970 | ui | `81586aa3` | TWO findings. `SKILL.md:50`: the walk treats "not an open PR head" as "integration branch", but a stacked parent can be CLOSED and still be the child's base, and PR 575 over closed parent 560 is a live example. `SKILL.md:68`: prove the response SHAPE with real typed three-field output, not just that the field is accepted |
| 521 | api | `82134581` | **All four threads RESOLVED by removal.** Needs a review of this head, then merge and deploy |
| 520 | api | `3d5d6929` | **Zero unresolved threads.** CI was still running. Needs a review of this head, then merge and deploy |
| Dependabot | both | ui 798/799/801/881, api 510/525/526 | Leave. Not this effort |

**`#561` HAS UNCOMMITTED WORK AND NO COMMIT. Read it before anything else touches that worktree.**
`C:\Users\thoma\orca\workspaces\orbit-ui-mobile\ticket-561-sheet-nav`, branch
`fix/ticket-561-sheet-nav`, sitting at `0600332b` with **15 modified files covering all eight sites
the ticket names plus seven test files**. The worker was stopped mid-write, so nothing was committed
and no test result was ever captured. Do not reset, stash or discard it. Read the diff, decide what
is already correct, and continue from there.

## Do this, in this order

1. **Drive 994, 992, 991 and 970 to merge.** Each has exactly one round of work left, listed above.
   None is blocked.
2. **`#561`**: read the stopped worktree first, then finish and deliver it.
3. **The two `orbit-api` pull requests**: review each head, then merge and deploy both.
4. **`#529`**, fully specified and answered. Gate BOTH listing and revoking behind the emailed code.
   **The switch is the part that matters**: `AppConfigKeys.RequireApiKeyCreationStepUp` defaults to
   `false`, so flip it to true in `AppConfigs` AFTER the deploy or the ticket ships inert.
5. **`#562`**: a weekday-scoped calendar event has NEVER imported on any shipped build, because the
   client sends `days` with a weekly unit and `HabitInvariants.cs:42-43` rejects that. Its interval
   and ordinal cases are already decided as visible refusals.
6. **`#545` stages 2 to 5**, 77 suppressions. Its reconciliation comment proves nothing is ownerless.
7. **The seven remaining screen tickets**: `#63`, `#67`, `#73`, `#76`, `#329`, `#57`, `#58`.

## Five things that cost real work on 2026-09-16

- **A killed worker has almost always COMMITTED, and the tree decides who finishes it.** CLEAN plus a
  complete commit: the orchestrator verifies and pushes it, which is delivery and saves a launch.
  DIRTY with a half-written edit: relaunch the worker. Both answers were correct on the same night.
- **Prove red AFTER the fact rather than quoting a dead session.** `git checkout <sha>~1 -- <only the
  source files>`, run the new test, capture, restore, confirm clean. Say in the pull request body
  that the worker was killed and that none of ITS numbers are quoted.
- **An order can be wrong, and a refusing worker can be more right than you.** On `#543` one refused
  and was half right, the correction was also wrong, and three P1s proved it. The root error was
  importing the WEB ARIA roving single-tab-stop pattern into an Android platform adapter. Check an
  order against the platform it targets, not against the pattern you know.
- **The local worker cap is TWO**, and the harness kills for low memory with 11 GB free. Do not run a
  root `turbo type-check` or a vitest suite while two are up. A `timeout 590 node tools/test-tools.mjs`
  exiting 124 with zero failures is starvation, not a result; re-run it unbounded.
- **`npx turbo run type-check --force`** when the result is evidence, and say it was forced.
  `--match-head-commit` needs the FULL sha. Never `git worktree remove --force` on Windows.

## State of the tree

`redesign/main` is `43bc28ad`, **299 commits ahead of `main`**. `main` is `a9558f7a` with Orbit
1.3.29 (88) live on the Play open track. Merged tonight: 984 (`3d2f01a5`) and 986 (`43bc28ad`).

183 worktrees in ui and 20 in api, four stashes in ui, none in api. Seven dirty trees in ui, one of
which is `#561`'s stopped worker. The spec's State section lists them with counts.

## `--sleep`

Thomas ran `/handoff --sleep`. Nobody is going to open this file, so do not stop after reading it.
Read and execute `.claude/skills/sleep/SKILL.md`, write run state under this session's own id, and
leave a live wake source before the turn ends. **A worker launched by a previous session does not
wake you**: its wake source belongs to that session. Own your own. Take every decision yourself,
always the best approach and never the easiest, and log each one.

## One more thing

Every identifier above came from a previous session. Treat each as a lead to verify, not a fact. On
2026-09-16 a handoff row said `#561`'s order was posted and the ticket had zero comments.
