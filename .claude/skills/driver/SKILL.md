---
name: driver
description: The Orbit delivery driver in one command. /driver starts it, or, when it already runs, reports every notification that sleep held, the week used and the held decisions. Product progress is /progress. /driver stop stops it. Use on /driver, start the driver, is the driver running, why is nothing happening, or stop the driver.
argument-hint: "[stop | update <full sha>]"
effort: low
---

# /driver

The driver `tools/drive.mjs` works every open ticket of the board and merges at the bar. It runs as the launchd job `com.thomas.orbit-drive` from the worktree `$HOME/orca/workspaces/orbit-ui-mobile/orbit-drive`. It runs from login until `/driver stop`. `/driver stop` also stops it from starting at the next login. `/driver` starts it again and turns login start back on.

- Log: `$HOME/Library/Logs/brain-automations/orbit-drive.log`.
- Plist: `$HOME/Library/LaunchAgents/com.thomas.orbit-drive.plist`. The brain `install.sh` installs it there. launchd loads it at every login, unless `/driver stop` disabled the service.

## /driver

0. Keep the owner's skills current, so each merged skill change reaches the next session:
   1. When `$HOME/Developer/orbit-ui-mobile` is on `main` with no local change, run `git -C $HOME/Developer/orbit-ui-mobile pull --ff-only`.
   2. A skill link in `$HOME/.claude/skills` that points into `$HOME/Developer/orbit-worktrees/` serves a skill before its pull request merges. Read the branch of the link's worktree with `git -C <link target> branch --show-current`. When `gh pr list --repo thomasluizon/orbit-ui-mobile --head <branch> --state merged --json number` returns an entry, delete the link with Node (`fs.unlinkSync`), so the repository copy serves it. Otherwise keep the link.
1. Run `launchctl enable gui/$(id -u)/com.thomas.orbit-drive`. A disabled service cannot load, so this turns login start back on.
2. Run `launchctl print gui/$(id -u)/com.thomas.orbit-drive`.
3. When it prints "Could not find service", start the driver:
   1. When the worktree is missing, run `git -C $HOME/Developer/orbit-ui-mobile fetch origin main`, then `git -C $HOME/Developer/orbit-ui-mobile worktree add --detach $HOME/orca/workspaces/orbit-ui-mobile/orbit-drive origin/main`.
   2. Run `launchctl bootstrap gui/$(id -u) $HOME/Library/LaunchAgents/com.thomas.orbit-drive.plist`.
   3. Say "The driver started." Then report as below.
4. Report every notification that sleep held since the last `/driver`. The owner keeps sleep on, so this is the only place he sees them.
   1. State dir: `S="$(git -C $HOME/Developer/orbit-ui-mobile rev-parse --path-format=absolute --git-common-dir)/orbit-drive"`. The last report time is in `$S/last-driver-report` (no file: the last 24 hours).
   2. Read every log line after that time that contains ` sleep held `. Each one is a notification the driver did not send.
   3. List all of them, first. Group repeats of the same item and say how many times. For a `needs:owner` item, check the label: when it is gone, say "already handled". A pull request with no open ticket has no label. Say "already handled" when it is closed, or when an `orbit-drive:owner-answer` comment follows its report. Write each in product terms, with its link when it is still open.
   4. Write the current time to `$S/last-driver-report`, and write `[]` to `$S/sleep-items.json`.
5. Report the driver's own state. Product progress is `/progress`, so repeat none of it here.
   1. Read the newest `pace` line of the log.
   2. Run `node tools/drive.mjs --release-status` and report the newest release train: what it released and where it stopped.
   3. Report: the week used on each account, and whether one stopped at 90% (`/over-limit` lets it go on) or runs with its pace off. Then the count of held decisions, as `/questions` step 1 lists the held tickets and pull requests. `/questions` answers them.

## /driver stop

1. Run `launchctl bootout gui/$(id -u)/com.thomas.orbit-drive`. A running worker ends its order. The next `/driver` reads its pid file.
2. Run `launchctl disable gui/$(id -u)/com.thomas.orbit-drive`. The setting persists across boots, so the driver stays stopped at the next login.
3. Run `launchctl print gui/$(id -u)/com.thomas.orbit-drive`. "Could not find service" means it stopped. Say that in one line.

## /driver update <full sha>

The driver moves to a newer driver commit of `main` by itself, at a tick with no worker running. Use this only to move it at once.

1. Run `git -C $HOME/orca/workspaces/orbit-ui-mobile/orbit-drive fetch origin main`, then `git -C $HOME/orca/workspaces/orbit-ui-mobile/orbit-drive checkout --detach <full sha>`.
2. Run `launchctl kickstart -k gui/$(id -u)/com.thomas.orbit-drive`.

## health.json

Every tick, good or failed, writes `health.json` in the state directory (`$S` of step 4 of `/driver`). A check outside the driver reads this file to find a blind or stuck driver.

| Field | Meaning |
| --- | --- |
| `writtenAt` | The time of the last write. An old value shows that no tick ended since that time. |
| `lastGoodTickAt` | The time of the last good tick. |
| `lastMergeAt` | The time of the last merge of the driver. |
| `openPulls` | The count of open pull requests in the repositories of the driver, from the read of the last good tick. |
| `oldestGreenApprovedAt` | The approval time of the oldest approved pull request that meets the bar and is not merged. It is `null` when no pull request is in that state. |
| `lastErrorClass` | The class of the first error that this tick recorded: `rate-limit`, `auth`, `network`, `server`, `timeout` or `other`. It is `null` when the tick recorded no error. |
| `rateLimitedUntil` | The time when the empty GitHub limit refills. It has a value only when `lastErrorClass` is `rate-limit` and `gh api rate_limit` shows an empty limit. Otherwise it is `null`. |
| `problems` | A list of `{ key, since, detail }`. Each `key` is stable: `blind:tickets`, `blind:<repo>`, `unmerged:<repo>#<number>` or `error:tick`. |

- All times are ISO strings. A time with no value is `null`.
- A good tick reads the tickets and each repository, and it checks each open pull request against the bar.
- The tick records these errors: a failed read, a failed plan of a pull request, an error that stops the check of a pull request, and an error that ends the tick.
- The tick does not record an action that fails after the check. A refused merge stays in `problems` as `unmerged:`.
- A failed read of the tickets or of a repository is a `blind:` problem. This includes the read before the driver reaps a worker.
- `error:tick` shows a recorded error in a tick with no failed read.
- The `since` of an `unmerged:` problem is the approval time. The `since` of each other problem is the time of the first tick that had it.
- A tick that records an error before the check ends keeps `lastGoodTickAt`, `openPulls`, `oldestGreenApprovedAt` and each `unmerged:` problem.
- A tick that a rate limit or the backoff holds reads nothing from GitHub. It keeps the last record and changes only `writtenAt`.
- A dry run writes no `health.json`. A failed write adds a `health error` line to the log, and the tick continues.

## What the owner session does

- Writes tickets with `/ticket`.
- Runs `/questions` for the held decisions.
- Runs `/sleep` and `/over-limit`.
- Sets an account's weekly pace when the owner says so: `node tools/drive.mjs --pace worker off` in `$HOME/orca/workspaces/orbit-ui-mobile/orbit-drive` runs that account at 3 workers with no line and no 90% stop, until its usage limit. `--pace worker on` restores the pace. The next tick reads it, with no restart.
- The driver reruns each failed job once before any launch, and files a Bug ticket for a check that passes on the rerun at the same head. A job that fails at its setup, at its checkout, at a gateway timeout or at a step that requires another job gets the rerun and no ticket. A `ci-fix` launch for a check that fails on a clean merge of the base, after a green commit, does not count toward the 2 fix launches. After 2 launches of a pull request or an order, the driver starts 1 launch on `claude-opus-5-5`. Its order holds the section `## Earlier launches`, which lists the facts of each earlier launch. That cap writes no label, no comment and no notice.
- When the Opus launch fails too, the driver starts one read-only re-plan run on `claude-opus-5-5`. The run answers `Plan: fresh` or `Plan: split`. The driver closes the stuck pull request and writes a `replan` record. A `fresh` plan builds on a new `-r<n>` branch. A `split` plan posts a new part set. The new plan gets its own launches. A ticket has at most 2 re-plans. When the ladder after the second re-plan fails, the driver gives the ticket and its open pull request the label `parked`, and writes one `parked` comment. It sends no notice. The driver starts no launch for a parked item.
- While an open item carries `parked`, the driver runs the harness review (`/ticket --auto --parked`) by itself, at most once a day. No owner run starts it.
- Starts a release at once with `/release`. The driver itself runs the release train every 4 hours.
- Runs each `owner-work` ticket.

## Rules

- The owner session writes no code for a ticket. A worker writes it.
- Only the driver merges, at the bar. Nobody uses an admin merge.
- Never edit the worktree `$HOME/orca/workspaces/orbit-ui-mobile/orbit-drive` by hand.
- Copy every ticket number, pull request number and sha from this run's output.
