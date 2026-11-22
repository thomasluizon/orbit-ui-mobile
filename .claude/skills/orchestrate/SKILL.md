---
name: orchestrate
description: Control the delivery driver, the program that works the board. Use to start, stop, update or check it. The driver starts a worker for each ticket and merges at the bar. The owner session writes no code for a ticket.
argument-hint: start | stop | status | update <full sha>
effort: low
---

# /orchestrate: control the delivery driver

The driver `tools/drive.mjs` works every open ticket of the board. It needs no session. It runs as the launchd job `com.thomas.orbit-drive` from `/driver-start` until `/driver-stop`, a logout or a shutdown. It runs from the worktree `$HOME/orca/workspaces/orbit-ui-mobile/orbit-drive`, which stays detached at a named commit of `main`.

- Log: `$HOME/Library/Logs/brain-automations/orbit-drive.log`.
- Plist: `$HOME/Developer/brain/scripts/automations/on-demand/com.thomas.orbit-drive.plist`.

## start

Run `/driver-start`. The driver never starts at login.

## stop

Run `/driver-stop`.

## update <sha>

Run this only after a driver pull request merges. Use the full sha of the merge commit.

1. Run `git -C $HOME/orca/workspaces/orbit-ui-mobile/orbit-drive fetch origin main`.
2. Run `git -C $HOME/orca/workspaces/orbit-ui-mobile/orbit-drive checkout --detach <full sha>`.
3. Run `launchctl kickstart -k gui/$(id -u)/com.thomas.orbit-drive`.

The running driver changes in no other way.

## status

Run `/driver-status`.

## What the owner session does

- Writes tickets with `/ticket`.
- Runs `/questions` for the held `needs:owner` items. A pull request that used its 2 fix launches gets one more launch for each owner comment that follows the cap report. Each cap report states the launch count, so a granted launch that ends at the same head gets a new report. The order carries the comment.
- Runs `/sleep`, `/over-limit` and `/driver-status`.
- The driver reruns each failed job once before any launch, and files a Bug ticket for a check that passes on the rerun at the same head. A `ci-fix` launch for a check that fails on a clean merge of the base, after a green commit, does not count toward the 2 fix launches.
- Runs releases.
- Runs each `owner-work` ticket when the driver notifies.
- Starts and stops the driver with `/driver-start` and `/driver-stop`.

## Rules

- The owner session writes no code for a ticket. A worker writes it.
- Only the driver merges, at the bar. Nobody uses an admin merge.
- Never edit the worktree `$HOME/orca/workspaces/orbit-ui-mobile/orbit-drive` by hand.
- Copy every ticket number, pull request number and sha from this run's output.
