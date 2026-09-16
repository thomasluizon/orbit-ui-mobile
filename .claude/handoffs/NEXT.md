# Continue the Orbit redesign

Read `.claude/specs/orbit-redesign.md` first. It is the living spec and it holds everything durable:
the standing instructions, the decisions, the constraints, the full state and every answer Thomas has
given. This prompt only says what to do next.

`.claude/specs/beta-release.md` is DONE and is a record, not a queue. Read its constraints once.

**Read the brain notes the spec names, through the Obsidian MCP, before you act.** They are listed
under `## Decisions this effort runs on`. All thirteen filenames were confirmed to still exist on
2026-09-16, but the MCP itself was unreachable at that moment (`fetch failed`, Obsidian not running)
so they were confirmed on disk, which misses frontmatter, tags and which decision superseded which.
**Re-confirm through the MCP when it is up.**

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

130 carried `repo:ui` and 65 carried `repo:api` on 2026-09-16.

## In flight, with a disposition on every row

**Nine UI pull requests and two `orbit-api` ones are open. No worker is running.** Every UI one
carries its `## Review harness` block, so that gate is satisfied; do not re-run those sweeps.

| PR | repo | head | disposition |
|---|---|---|---|
| 998 | ui | `2212d9e1` | **FIRST.** Perfil stage 11, the last five suppressions. `Cross-Platform Parity` is RED because it is mobile-only: add the `parity:exempt` label with a one-line body justification. **Never type-checked or pushed by a person** because the session was interrupted mid-verification; lint is clean on the file and the ratchet reads mobile 90 to 85. Verify, push, drive to approval, merge. **`#71` closes when it merges.** |
| 994 | ui | `921ed55c` | DRIVE to approval, then merge. Rounds 4 and 5 pushed and evidenced |
| 992 | ui | `8cdef1b4` | DRIVE to approval, then merge. SonarCloud red does not gate this branch |
| 991 | ui | `b604fb54` | **NEVER OPENED this session.** Read its findings from scratch |
| 988 | ui | `4558b2c2` | ALL GREEN as of late afternoon. Re-check, force a re-review at the merge head, merge |
| 987 | ui | `3ffc788d` | DRIVE to approval, then merge. SonarCloud red only |
| 986 | ui | `4e890c67` | DRIVE to approval, then merge |
| 984 | ui | `fcfde93c` | **NEVER OPENED this session.** Read its findings from scratch |
| 970 | ui | `52974481` | **NEVER OPENED this session.** Three P1s were answered at this head on 09-15; re-read |
| 520 | api | `b74178ba` | A NEW finding arrived after round 3 and is UNREAD. The spec's Open questions section has the analysis and the model change to consider |
| 521 | api | `3d59d9f9` | A NEW finding arrived after round 2 and is UNREAD. Also BEHIND `main`, so it needs a merge-forward. Consider `TimeZoneInfo.HasSameRules`; the spec says why |
| Dependabot | both | Leave. Not this effort |

## Do this, in this order

1. **Merge 998 and close `#71`.** Verify it first; nobody has.
2. **Clear the review findings on the other eight UI pull requests and merge them.** Ask for a forced
   `--re-review` on any head that matters. That has now found a real defect on an already-green pull
   request SEVEN separate times, most recently 248 lines of dead code on 983.
3. **Read the two `orbit-api` findings and act on them**, then merge and deploy both.
4. **`#561`, filed this session and not picked up.** Eight Android sheets navigate while presented,
   which wedges every later modal until the app restarts. The paywall push inside the habit form is
   one of them. The ticket carries every `file:line`.
5. **`#529`**, unblocked and decided but NOT BUILT. Server change alone, no config flag, no
   `MinSupportedVersion` raise, the break recorded in the pull request body, scoped to beta only.
6. **Give the ownerless suppressions a home.** 66 web and 90 mobile remain. Most map to a screen
   ticket, but a block of shared overlays and primitives maps to none. Assign each file to a ticket,
   or file one for the shared surfaces. A suppression with no owner survives every screen pass.
7. **Then the remaining screen tickets**: `#63`, `#67`, `#73`, `#76`, `#329`, plus `#57` and `#58`.
8. **`#34` is one external line from closed.** The listing is applied and submitted; Google's review
   takes up to 7 days. Re-read the live public listing, logged out, and close the ticket when the new
   text is live. No console work remains.

## Four things that cost real work

- **The local worker cap is TWO**, and the harness killed workers with 11.3 GB of 31.5 GB free, so
  free memory tells you nothing. **Do not run a root type-check or a vitest suite while two workers
  are up.** Every killed worker had already COMMITTED; read the worktree before assuming loss.
- **`npx turbo run type-check --force`** when the result is evidence. A cached `FULL TURBO` pass on a
  file you just changed proves nothing.
- **Prove red on a commit somebody else wrote**: `git checkout <sha>~1 -- <source files>`, run,
  capture, `git checkout <sha> -- <same files>`, confirm the tree is clean.
- **Read only the LATEST check run per name**: `group_by(.name) | map(sort_by(.startedAt) | last)`.
- **`--match-head-commit` needs the FULL sha.** A short one fails to coerce to `GitObjectID`.
- **Never `git worktree remove --force` on Windows.** `rmdir` the junctions first.

## Worktree debt, corrected

The previous prompt called `ticket-335-avisos` eleven commits that exist only on this machine. **That
was wrong.** Its upstream is `origin/redesign/main`, so a squash-merged branch's own commits read as
unpushed forever. Pull request 843 is MERGED and `#335` is CLOSED. The same correction applies to
`orbit-api`'s `ticket-337-api-copy`: 504 is MERGED, `#411` is CLOSED. All four detached HEADs are
reachable from a branch. Nothing is at risk.

The real debt is the count: **180 worktrees in ui, 20 in api**, plus four stashes and six dirty trees.
The spec's State section lists them.

## `--sleep`

Thomas ran `/wrap-up --sleep`. Nobody is going to open this file, so do not stop after reading it.
Read and execute `.claude/skills/sleep/SKILL.md`, write run state under this session's own id, and
leave a live wake source before the turn ends. Take every decision yourself, always the best approach
and never the easiest, and log each one.

## One more thing

Every identifier above came from a previous session. Treat each as a lead to verify, not a fact.
