# Finish the prod release spec

Read `.claude/specs/orbit-prod-release.md` first, all of it. It is the living record: the standing
instructions in his words, the decisions, the constraints, the full state and every answer he has
given. Read `## The order` before anything else, then `## State`, then
`## What the night of 2026-09-18 into 09-19 added`.

`.claude/specs/beta-release.md` is the record for work that ships off `main`. Read its constraints
once; they bite on anything targeting `main`.

Read the brain notes the spec names through the Obsidian MCP: `mcp__obsidian__obsidian_list_notes`,
then `mcp__obsidian__obsidian_get_note`. List `2 Areas/20-29 Orbit Engineering/Decisions/` and copy
the filenames that come back rather than the ones you remember.

## Entry point

`/sleep`. It enters `/orchestrate --sleep` itself. Do not treat them as two choices.

## The goal

Finish `.claude/specs/orbit-prod-release.md`: an empty board and a production release. Re-derive what
is left rather than trusting any list below:

    gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400
    gh issue list --repo thomasluizon/orbit-tickets --state open --milestone "539 Redesign" --limit 400
    gh pr list --repo thomasluizon/orbit-ui-mobile --state open
    gh pr list --repo thomasluizon/orbit-api --state open

**A blocker is the next piece of work, not an ending.** The only honest endings are the allowance
running out, the machine stopping, or him saying stop.

## Two things he settled at the last wrap-up. Do not re-open either.

- **A worker editing `node_modules` is never his to explain.** He has answered it five times, the
  last time angrily. Never ask, never investigate the origin. `#601` owns the fix and its scope is
  prevention: the prohibition into `tools/compose-prompt.mjs` so every generated order carries it, a
  `PreToolUse` hook refusing any write that resolves inside `node_modules`, and an mtime walk to
  catch what arrives another way. **Put the prohibition into the order generator before you launch
  the next worker**, because every order you send until then permits it.
- **The failed-delete toast pauses on hover and focus.** Granted design-system change, one action
  stays Retry, recorded on `#460`. It needs a caller sweep; the toast is a shared primitive.

## Codex is out until 2026-09-22 07:23, so Claude is the worker

Codex and Pullfrog share ONE OpenAI meter. Read `§5.4.1` of `.claude/skills/orchestrate/SKILL.md`.

`.claude/orchestrator.json` in the main checkout is UNCOMMITTED and carries both the `claude` engine
and `worker: "claude"`. Its args are the hardened set that pull request 1023 commits:
`["-p", "--output-format", "stream-json", "--verbose", "--strict-mcp-config", "--permission-mode", "bypassPermissions"]`.
Check it is still flipped before you launch anything. **Revert on 2026-09-22** with
`git checkout -- .claude/orchestrator.json`, which restores the engine once 1023 has merged.

Expect five reds for as long as the switch is on, and none is a licence to edit a test:
`node tools/test-tools.mjs` ends `ORBIT TOOLS GATE FAILED (4)`, two assertions in
`tools/__tests__/orchestrator-config.mjs` (`:98-102`, `:103-108`) and two in
`tools/__tests__/launch-worker.mjs` (`:274-277`, `:279-286`), and `node tools/check-calibration.mjs`
exits 1. A FIFTH unexplained FAIL is a real defect. Run the whole gate: `--only orchestrator-config`
cannot see the launch-worker pair, which is how the count was read as two.

One further FAIL is LOAD-SENSITIVE and is not the switch: `tools/__tests__/launch-worker.mjs` runs
`a worker burning CPU while writing nothing anywhere is NOT killed as stalled` against real clocks,
a 0.15 minute ceiling and the 1.5 percent CPU floor at `tools/launch-worker.mjs:565`. With another
worker on the machine it misses that floor and fails on its own. Measured 2026-09-18 in the
`ticket-598-claude-engine` worktree, which carries the committed `"worker": "codex"`:
`ORBIT TOOLS GATE FAILED (1)`, that one test alone. Check that name first, rerun it on a quiet
machine, and do not change it: it belongs to no engine-switch pull request and D95 applies.

**Never use a Claude subagent as a worker.** `node tools/launch-worker.mjs` is the only path and its
LAUNCHER pid is the wake source, not the worker's. **Two concurrent workers is the cap**, his words:
"all these workers makes the machine unusable ... use less workers, at least 2". Cap each one with
`--concurrency=1` on turbo and about `--maxWorkers=2` on vitest.

**A subagent IS the right tool for a review, and point it at the worktree carrying the exact head.**
The first three reviews last night read the base checkout and every citation they made about changed
files was weaker for it.

## In flight, with a disposition on every row

| what | where | disposition |
|---|---|---|
| worker on `ui#1019` round 7 | `...\orbit-ui-mobile\ticket-460-notify-announce`, branch `fix/ticket-460-notify-announce`, log `%TEMP%\orbit-workers\#460-1789761460444.log`, launcher pid 12220 | ALIVE at handoff, one unpushed commit. **Outcome unknown, read the worktree first.** |
| worker on `api#532` round 2 | `...\orbit-api\ticket-75-emails`, branch `feature/ticket-75-emails`, log `%TEMP%\orbit-workers\ORB-69-1789761486866.log`, launcher pid 1296 | ALIVE at handoff, 13 modified files. **Outcome unknown.** Sixteen findings ordered, four blocking. |
| `ui#1007` | head `4e17d0c5` | Round 3 delivered AND pushed before its ceiling kill. CI 28 green, 0 failures, `Surface Manifest Drift` green. **Review at this head, then merge.** |
| `ui#992` | head `24b2f7f6` | Both P1 fixed and verified, manifest regenerated to 185 surfaces, harness 1811 assertions. **Review at this head, then merge.** |
| `ui#1023` | head `0efefd35` | Round 4 ORDERED on `#598`: the tool-versus-prose merge bar, the `--mcp-config` absence assertion, three P3. |
| `api#521` | head `88c3de52` | Round 6 delivered and **never re-reviewed at that head.** Review it. |
| `api#528` | head `3835402c` | Findings 2, 4, 5 fixed. Findings 1 and 3 remain, ordered on `#529`. **Do NOT flip `RequireApiKeyCreationStepUp`.** |
| `api#531` | head `d652a1fd` | All three findings fixed, red-first proven. **Review at this head.** |
| `1890341c` in `ticket-58-achievements` | branch `fix/ticket-461-notification-actions` | Still the disposable pre-squash form of merged pull request 1014. Leave. |
| Dependabot, `orbit-landing-page` | both repos | Leave. Not this effort. |

**Every `orbit-api` pull request targets protected `main` and cannot merge before 2026-09-22 or
without him merging by hand.** That is external. Get them merge-ready anyway.

## The order

1. Put the `node_modules` prohibition into `tools/compose-prompt.mjs` before the next worker launch.
2. Read both live worktrees and finish whatever those two workers left.
3. Review `ui#1007` and `ui#992` at their exact heads and merge them. `redesign/main` is unprotected,
   so the bar is green checks at the exact head plus a separate-agent review posted in full on the
   pull request naming the substitution. Nothing this run merges on a READY receipt; see below.
4. `ui#1023` round 4, then review and merge it, so the worker engine is committed.
5. Review `api#521` and `api#531`; finish `api#528` findings 1 and 3; finish `api#532`.
6. File the three findings the spec's State section lists under "Three findings that need tickets",
   then take `#596`, `#597` and the remaining milestone tickets.

## Known, and it will bite you at step 3

`tools/record-readiness.mjs:151` INJECTS `pullfrog-approval` when protection returns no required
checks, so **no receipt can reach READY on unprotected `redesign/main` while the allowance is out**.
`SKILL.md:1118` then says a blocked receipt never permits a merge, and
`.claude/hooks/require-wake-source.mjs:29-33` will not let the night end on one either. `#598` round 4
owns the reconciliation.

Until it lands, run the other path and say so: green checks at the exact head, the independent review
posted on the pull request, and his written instruction that a separate-agent review plus green
checks is the bar on that branch. End on recorded named blockers rather than on receipts.

## Blocked, needs Thomas

- **Do NOT flip `RequireApiKeyCreationStepUp` to `true`.** `api#528` is still fixing the agent
  lockout; with it on, chat and MCP can never obtain the grant. Also `AppConfigService.cs:51-74`
  swallows a bad parse, so `1`, `yes` or `true ` leaves the gate OFF while the runbook's read-back
  passes.
- **Pullfrog's Claude fallback does not work for a real review.** The app's JSON payload resolves
  models server side where only the Codex subscription is registered. Worth reporting to Pullfrog.
- `#318` stage 2 and `#320` stage 5 are his: a conversation and a first-hand device pass.
- `orbit-api` `521` and `528` still need him to merge and deploy by hand.

## `--sleep`

Nobody is going to open this file. Read and execute `.claude/skills/sleep/SKILL.md`, write run state
under this session's own id, and leave a live wake source before the turn ends. A worker launched by
a previous session does not wake you; its wake source belongs to that session.

Take every decision yourself, always the best approach and never the easiest, and log each one.

## One more thing

Every identifier here came from a previous session. Treat each as a lead to verify, not a fact.

**And when two honest readings of "the installed source" disagree, suspect the tree before you
suspect the reader.** Four contradictory citations of the same two files were published across three
sessions last night and every one was accurate about the checkout its author read, because a worker
had edited `node_modules` in one of them. Check for a file whose mtime is later than its own
package's `package.json` before you correct anyone in public.
