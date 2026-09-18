# Finish the prod release spec

Read `.claude/specs/orbit-prod-release.md` first, all of it. It is the living record: the standing
instructions in his words, the decisions, the constraints, the full state and every answer he has
given. Read `## The order` before anything else, then `## State`, then
`## What the day of 2026-09-18 added`.

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

## Codex is out until 2026-09-22 07:23, so Claude is the worker

Codex and Pullfrog share ONE OpenAI meter and both are exhausted. Read `§5.4.1` of
`.claude/skills/orchestrate/SKILL.md`.

`.claude/orchestrator.json` declares a `claude` engine beside `codex`. The committed default is
`codex` because `tools/test-tools.mjs` pins it; flipping the top-level `worker` key to `claude` is an
uncommitted operational switch. Check whether it is already flipped in the main checkout, and flip it
if not. Revert it on 2026-09-22.

**Never use a Claude subagent as a worker.** Five did this day: every one died with its session,
none registered a wake source, and each had to be told to commit before a handoff was possible.
`node tools/launch-worker.mjs` is the only path, and its pid IS the wake source.

**Two concurrent workers is the cap.** Thomas, 2026-09-18: "all these workers makes the machine
unusable, this is not good even if im not using it, because everything goes slow, use less workers,
at least 2". Cap each one: `--concurrency=1` on turbo and about `--maxWorkers=2` on vitest. Killing
a worker leaves orphaned vitest processes under `orca\workspaces` that must be swept by hand.

## In flight, with a disposition on every row

| what | where | disposition |
|---|---|---|
| headless Claude worker on `api#521` | `...\orbit-api\ticket-526-calendar-tz`, branch `fix/ticket-526-calendar-tz`, log `%TEMP%\orbit-workers\#526-1789748971554.log` | ALIVE at handoff, pid 20560. **Outcome unknown, read the worktree first.** It was dirty at launch. |
| `api#528`, work UNCOMMITTED | `...\orbit-api\ticket-529-apikey-stepup` | Three modified test files. Re-issue the six findings from the review comment on the pull request, which is the durable copy. |
| `ui#1019` | head `d5320f05` | All findings fixed, red-first proven twice. **Merge when CI is green.** |
| `ui#1007` | head `89c42172` | Three blocking defects fixed, full suite 8,112 tests green on the committed bytes. Re-review at head, then merge. |
| `ui#992` | head `8ddcca0e` | Blocking defect fixed at the `RadioGroup` level. Full suite green on pre-lint-fix bytes only. Re-review at head, then merge. |
| `ui#1023` | head `569d97c8` | The `claude` worker engine. Review, then merge. |
| `api#531`, `api#532` | heads `2b41b856`, `dd862844` | Built and CI-green, **never reviewed**. They target protected `main` and need `pullfrog-approval`, so they cannot merge until the allowance resets or Thomas merges them by hand. |
| `chore/pullfrog-fallback-v2` | branch, not merged | An experiment that rewrites the Pullfrog payload as plain text. It reaches Claude but the agent exhausted its context mid-review and never posted. Do not merge it without solving that. |
| Dependabot, `orbit-landing-page` | both repos | Leave. Not this effort. |

## The order

1. Merge `ui#1019` the moment its CI is green at `d5320f05`.
2. Re-review `ui#1007` and `ui#992` at their exact heads, clear anything found, merge.
3. Review and merge `ui#1023`, so the worker engine is on `redesign/main`.
4. Relaunch the `api#528` worker from the pull request's review comment.
5. Review `api#531` and `api#532`. They cannot merge yet; get them ready.
6. Take `#595`, `#596`, `#597`, then the remaining milestone tickets.

`redesign/main` is UNPROTECTED and requires no approval check, so a review by a separate agent plus
green checks at the exact head is the merge bar there. Protected `main` is different and needs
Pullfrog.

## Blocked, needs Thomas

- **Do NOT flip `RequireApiKeyCreationStepUp` to `true`.** With it on, chat and MCP can never obtain
  the grant so `get_api_keys` returns 428 permanently, and a web revoke consumes the grant so the key
  list then 428s. `api#528` is fixing both. Also: `AppConfigService.cs:51-74` swallows a bad parse, so
  a row of `1`, `yes` or `true ` leaves the gate OFF while the runbook's read-back check passes.
- **Pullfrog's Claude fallback does not work for a real review.** The app's JSON payload resolves
  models server side where only the Codex subscription is registered. He ran `pullfrog auth claude`
  and the console shows Claude Pro/Max configured, yet the runner still lists 15 OpenAI models and no
  Anthropic one. Worth reporting to Pullfrog.
- `#318` stage 2 and `#320` stage 5 are his: a conversation and a first-hand device pass.

## `--sleep`

Nobody is going to open this file. Read and execute `.claude/skills/sleep/SKILL.md`, write run state
under this session's own id, and leave a live wake source before the turn ends. A worker launched by
a previous session does not wake you; its wake source belongs to that session.

Take every decision yourself, always the best approach and never the easiest, and log each one.

## One more thing

Every identifier here came from a previous session. Treat each as a lead to verify, not a fact.

Two claims this session published turned out false and had to be corrected in public: a review cited
`ReactNativeFeatureFlagsDefaults.kt:86,92` as reading `false` when both lines read `true`, and
`worker: "claude"` was committed before the tools harness was read. **Open the source and the thread
body, never the paraphrase**, and read a gate's output before claiming it passed. A `| tail` or a
trailing `echo` reports the pipe's exit code, not the command's.
