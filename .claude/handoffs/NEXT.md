# NEXT

**Read `.claude/specs/orbit-prod-release.md` first**, and its last section, "What 2026-09-24 added",
before anything else.

## Entry point

`/sleep`. It runs `/orchestrate` itself. Codex (`gpt-6-sol`) writes every code change through
`node tools/launch-worker.mjs`, never a Claude subagent.

## The goal: finish the spec

The goal is an empty board and a production release, exactly as the spec defines it. Re-derive what
is left rather than trusting this file:

    gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400

That query returned 247 on 2026-09-24. A blocker is the next piece of work. Only an exhausted
allowance, the machine stopping, or Thomas saying stop ends the run.

## What to do, in order

1. `ui#1035` is **merged** into `redesign/main` as `1b6ebc8e` (Pullfrog APPROVED at `4e2ccb47`).
   The harness runs on this Mac.
2. **`#633` is the top priority, ahead of every batch.** It covers the dead three-dot menu (root cause
   proven, GPT-6 Sol agreed) and the drill ignoring Show completed. Run it as one PR against `main`,
   merge it to `main`, then run `/android-release`. Thomas asked for exactly this.
3. Backport the `#633` fixes to `redesign/main` as a separate PR. The redesign deleted
   `anchored-menu.tsx` and `drill-view.tsx`; `habit-drill.tsx` needs the drill fix, and the redesign's
   menu needs checking for the same state-rollback class.
4. **Fix `/handoff --sleep` so it ends the session.** Thomas, 2026-09-24, after a `/handoff --sleep` run
   kept working: "i ran /handoff, why are you continuing? handoff explicitly says that this session is
   over." Change `.claude/skills/handoff/SKILL.md` ("Under `--sleep`, do not stop there", and the
   `--sleep` lines in its Input and first sections) so `--sleep` only makes `NEXT.md` a prompt for an
   unattended next session. The handing-off session always ends. Check `.claude/skills/wrap-up/SKILL.md`
   and `.claude/skills/sleep/SKILL.md` for the same assumption, then run both harnesses.
5. Then continue the spec's batch order: `#627` first in batch 0b, `ui#1029` round 4, the
   `ui#1030` re-review, the `ui#1033` first review, the rest of 0b, then 0c, then batch 1.

## In flight, each with a disposition

| item | state | disposition |
|---|---|---|
| `ui#1035` | MERGED `1b6ebc8e` | done |
| `#633` | worktree `~/orca/workspaces/orbit-ui-mobile/ticket-633-menu-drill`, branch `fix/ticket-633-menu-drill` off `main` `959381da`, deps installed, NO worker launched, order at the old session's scratchpad `ticket-633-prompt.md` (recompose it) | step 2: compose the order, launch the worker |
| `ui#1029`, `ui#1030`, `ui#1033` | open on `redesign/main`, untouched today | step 4, as the spec says |
| `ui#1034`, `ui#801`, `ui#799`, `ui#798` | dependabot PRs on `main`, never triaged | triage in step 4; `ui#798` has a red `Contract Drift` |
| `api#521`, `api#534` | earlier APPROVED, waiting on Thomas's manual deploy | leave for Thomas |
| `api#528` | CHANGES_REQUESTED | spec batch 6 |
| `api#531`, `api#532`, `api#533` | open, reviews owed | spec batches 1 and 2a |
| `api#530`, `api#535`, `api#536` | dependabot | triage with the ui ones |
| `landing#73` to `#79` | dependabot | triage with the ui ones |
| scratch worktree `menu-probe` | detached at `959381da` in this session's scratchpad, instrumented with `[DEBUG-m3n7]` | debug only, never a PR. Remove with `git worktree remove --force` once `#633` is verified |
| emulator | running `Orbit_Pixel_9_API_35` with the instrumented probe build (versionCode 91), logged in as Thomas | install the `#633` build over it to verify, same re-sign steps as the spec |
| background `adb logcat` | streaming to the scratchpad | stop it when the probe is removed |

Checked and empty in all three repos: stashes, unpushed commits, dirty trees. The only detached HEAD
is the scratch `menu-probe` worktree. No worker was running when this was written.

Every identifier here came from a previous session. Treat each as a lead to verify.

## --sleep

This run continues unattended in the same session through `/sleep`, with this spec's goal.
