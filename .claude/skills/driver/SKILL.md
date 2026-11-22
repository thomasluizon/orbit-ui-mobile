---
name: driver
description: The Orbit delivery driver in one command. /driver starts it, or reports its progress when it already runs. /driver stop stops it. Use on /driver, start the driver, is the driver running, why is nothing happening, or stop the driver.
argument-hint: "[stop | update <full sha>]"
effort: low
---

# /driver

The driver `tools/drive.mjs` works every open ticket of the board and merges at the bar. It runs as the launchd job `com.thomas.orbit-drive` from the worktree `$HOME/orca/workspaces/orbit-ui-mobile/orbit-drive`. It runs from `/driver` until `/driver stop`, a logout or a shutdown. It never starts at login.

- Log: `$HOME/Library/Logs/brain-automations/orbit-drive.log`.
- Plist: `$HOME/Developer/brain/scripts/automations/on-demand/com.thomas.orbit-drive.plist`. Never copy it into `$HOME/Library/LaunchAgents/`: from there it starts at every login.

## /driver

1. Run `launchctl print gui/$(id -u)/com.thomas.orbit-drive`.
2. When it prints "Could not find service", start the driver:
   1. When the worktree is missing, run `git -C $HOME/Developer/orbit-ui-mobile fetch origin main`, then `git -C $HOME/Developer/orbit-ui-mobile worktree add --detach $HOME/orca/workspaces/orbit-ui-mobile/orbit-drive origin/main`.
   2. Run `launchctl bootstrap gui/$(id -u) $HOME/Developer/brain/scripts/automations/on-demand/com.thomas.orbit-drive.plist`.
   3. Say "The driver started." Then report as below.
3. Report the progress:
   1. Read the last 50 lines of the log.
   2. Run `node tools/drive.mjs --dry-run` in the worktree.
   3. Report in product terms, in this order: what a worker builds now; the week used on each account (the `pace` line) and whether one stopped at 90% (`/over-limit` lets it go on); the held decisions (`needs:owner`), counted (`/questions` answers them); what else waits, grouped as blocked by launch, blocked by another ticket, and owner-work. Write no ticket or pull request numbers.

## /driver stop

1. Run `launchctl bootout gui/$(id -u)/com.thomas.orbit-drive`. A running worker ends its order. The next `/driver` reads its pid file.
2. Run `launchctl print gui/$(id -u)/com.thomas.orbit-drive`. "Could not find service" means it stopped. Say that in one line.

## /driver update <full sha>

The driver moves to a newer driver commit of `main` by itself, at a tick with no worker running. Use this only to move it at once.

1. Run `git -C $HOME/orca/workspaces/orbit-ui-mobile/orbit-drive fetch origin main`, then `git -C $HOME/orca/workspaces/orbit-ui-mobile/orbit-drive checkout --detach <full sha>`.
2. Run `launchctl kickstart -k gui/$(id -u)/com.thomas.orbit-drive`.

## What the owner session does

- Writes tickets with `/ticket`.
- Runs `/questions` for the held `needs:owner` items. A pull request that used its 2 fix launches gets one more launch for each owner comment that follows the cap report. Each cap report states the launch count, so a granted launch that ends at the same head gets a new report. The order carries the comment.
- Runs `/sleep` and `/over-limit`.
- The driver reruns each failed job once before any launch, and files a Bug ticket for a check that passes on the rerun at the same head. A `ci-fix` launch for a check that fails on a clean merge of the base, after a green commit, does not count toward the 2 fix launches.
- Runs releases.
- Runs each `owner-work` ticket.

## Rules

- The owner session writes no code for a ticket. A worker writes it.
- Only the driver merges, at the bar. Nobody uses an admin merge.
- Never edit the worktree `$HOME/orca/workspaces/orbit-ui-mobile/orbit-drive` by hand.
- Copy every ticket number, pull request number and sha from this run's output.
