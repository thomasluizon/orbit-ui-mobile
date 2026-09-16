# Continue the Orbit redesign

Read `.claude/specs/orbit-redesign.md` first. It is the living spec and it holds everything durable:
the standing instructions, the decisions, the constraints, the full state and the four answers Thomas
gave on 2026-09-16. This prompt only says what to do next.

`.claude/specs/beta-release.md` is DONE and is a record, not a queue. Read its constraints section
once; what it learned about `strict: true`, `pullfrog-approval`, killed workers and red checks that
name no defect still bites here.

**Read the brain notes the spec names, through the Obsidian MCP, before you act.** They are listed in
the spec under `## Decisions this effort runs on`.

## Your entry point

`/orchestrate`. Do not restate what it does; work through it.

## The goal

**Finish `.claude/specs/orbit-redesign.md`.** The run ends when every screen ticket is closed and
`node tools/redesign-coverage.mjs` reports a valid mapping with nothing missing. That command is
necessary and NOT sufficient: it validates the MAPPING, never whether a surface satisfies its
ticket, and it reads a manifest no CI job regenerates. Judge every ticket against its own acceptance
criteria, in the tree, before closing it.

A blocker is the next piece of work, not an ending. Re-derive what is left:

    gh issue list --repo thomasluizon/orbit-tickets --state open --label "repo:ui" --limit 300
    gh pr list --repo thomasluizon/orbit-ui-mobile --state open
    gh pr list --repo thomasluizon/orbit-api --state open

131 carried `repo:ui` and 65 carried `repo:api` on 2026-09-16.

## In flight, with a disposition on every row

**Seventeen pull requests are open and none is approved.** The common blocker is
`pullfrog-approval` at the current head. Every UI one already carries its `## Review harness` block,
so that gate is satisfied; do not re-run those sweeps.

| PR | repo | disposition |
|---|---|---|
| 970, 983, 984, 985, 986, 987, 988, 991, 992, 993, 994, 995, 996 | ui | DRIVE to approval, then merge under D90. Request a review at the exact head, fix what it finds, merge |
| 997 | ui | HOLD. Must not merge before `orbit-api` 527 is merged AND deployed |
| 527 | api | MERGE and DEPLOY FIRST. It unblocks 997 |
| 521, 520 | api | DRIVE to approval, then merge and deploy. Both are code-complete |
| 881, 801, 799, 798 (ui), 526, 525, 510 (api) | both | Dependabot, not this effort. Leave |

**One worker was still running when this was written.** `#557`, worktree
`ticket-557-android-login`, branch `fix/ticket-557-android-login`, log under
`C:/Users/thoma/AppData/Local/Temp/orbit-workers/`. It was sent to run the ui-skills sweep on PR 994
and it reported committing `755e9061` before this handoff was written, but the outcome after that is
unknown. **Read that worktree before assuming anything.**

**Worktree and branch debt, none of it this session's.** Four stashes, seven worktrees holding
uncommitted or unpushed work, two of them on a detached HEAD. The full list is in the spec's State
section. The one to look at first is `ticket-335-avisos`: a CLEAN tree hiding **eleven commits that
exist only on this machine**.

A scratchpad decision log for the 2026-09-16 run lives outside the repo and dies with that session.
Everything durable from it is already in the spec.

## Do this, in this order

1. **Merge and deploy `orbit-api` 527.** Everything about the widget waits on it. Then 997 can merge.
2. **Drive `orbit-api` 521 and 520 to approval, then merge and deploy.** Both are code-complete:
   521's recurrence fix is `ee8f3e44`, 520's fail-open fixes are `f708d755`. Yours to merge under his
   standing instruction.
3. **Drive the thirteen ready UI pull requests to approval and merge them.** Ask for a forced
   `--re-review` on any head that matters. That found a real defect four separate times on
   2026-09-15 and twice more on 2026-09-16, including behind an otherwise green PR.
4. **Apply the Play Console listing.** The final EN and pt-BR text is a comment on `#34`, already
   through a BRAND.md pass and a `/humanizer` pass. Thomas asked specifically that the NEXT session
   apply it. Set the public developer name to `TL SOFTWARE ENGINEERING LTDA`, paste the short
   description and the keywords in both locales, and **recount every field against the live console
   limits before pasting**. Do it in the browser yourself. Closes `#34`, PARTIAL since 2026-08-25.
5. **`#543`: find a supported route for Android key events, or report an honest null.** The three
   things to check are on the ticket. Never patch a dependency, never flip a React Native feature
   flag, never restore `415320d7`.
6. **`#529` is unblocked.** Build it the direct way: server change alone, no config flag, no
   `MinSupportedVersion` raise, and record the break in the PR body. Scoped to beta only.
7. Then the remaining screen tickets: `#63`, `#67`, `#73`, `#74`, `#76`, `#329`, plus `#57` and `#58`.

## Four things that cost real work

- **The local worker cap is TWO**, and even two plus a review poll was killed for memory repeatedly
  on 2026-09-16. Every killed worker had COMMITTED first, so read the worktree before assuming loss.
- **Read only the LATEST check run per name.** GitHub's rollup lists every historical run, and
  reading them all reports failures that were superseded hours ago. Use
  `group_by(.name) | map(sort_by(.startedAt) | last)`.
- **`--match-head-commit` needs the FULL sha.** A short one fails to coerce to `GitObjectID`.
- **Never `git worktree remove --force` on Windows.** It follows a junction and deletes the target's
  contents. `rmdir` the junctions first, then remove without `--force`.
- **`mobile-eslint` exiting 2 with no lint output means STALE SUPPRESSIONS**, not violations. Run
  `npx eslint . --prune-suppressions` in `apps/mobile`. It strictly lowers the baseline.
- **A pre-commit hook lints the INDEX; a manual `eslint .` lints the WORKTREE.** When they disagree,
  you forgot to stage something.

## One more thing

Every identifier above came from a previous session. Treat each as a lead to verify, not a fact.
