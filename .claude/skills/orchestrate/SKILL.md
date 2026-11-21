---
name: orchestrate
description: Control the delivery driver, the program that works the board. Use to start, stop, update or check it. The driver starts a worker for each ticket and merges at the bar. The owner session writes no code for a ticket.
argument-hint: start | stop | status | update <full sha>
effort: low
---

# /orchestrate: control the delivery driver

The driver `tools/drive.mjs` works every open ticket of the board. It needs no session. It runs as the launchd agent `com.thomas.orbit-drive`. It runs from the worktree `$HOME/orca/workspaces/orbit-ui-mobile/orbit-drive`, which stays detached at a named commit of `main`.

- Log: `$HOME/Library/Logs/brain-automations/orbit-drive.log`.
- Plist: `$HOME/Developer/brain/scripts/automations/launchd/com.thomas.orbit-drive.plist`.

## start

1. When `$HOME/orca/workspaces/orbit-ui-mobile/orbit-drive` is missing, run `git -C $HOME/Developer/orbit-ui-mobile fetch origin main`.
2. Then run `git -C $HOME/Developer/orbit-ui-mobile worktree add --detach $HOME/orca/workspaces/orbit-ui-mobile/orbit-drive origin/main`.
3. Copy the plist to `$HOME/Library/LaunchAgents/`.
4. Run `launchctl bootstrap gui/$(id -u) $HOME/Library/LaunchAgents/com.thomas.orbit-drive.plist`.
5. Run `status`.

## stop

Run `launchctl bootout gui/$(id -u)/com.thomas.orbit-drive`. A running worker ends its order. The next start reads its pid file.

## update <sha>

Run this only after a driver pull request merges. Use the full sha of the merge commit.

1. Run `git -C $HOME/orca/workspaces/orbit-ui-mobile/orbit-drive fetch origin main`.
2. Run `git -C $HOME/orca/workspaces/orbit-ui-mobile/orbit-drive checkout --detach <full sha>`.
3. Run `launchctl kickstart -k gui/$(id -u)/com.thomas.orbit-drive`.

The running driver changes in no other way.

## status

1. Run `launchctl print gui/$(id -u)/com.thomas.orbit-drive`. Read the state and the pid.
2. Run `git -C $HOME/orca/workspaces/orbit-ui-mobile/orbit-drive rev-parse HEAD`.
3. Read the last 50 lines of the log.
4. Run `node tools/drive.mjs --dry-run` in `$HOME/orca/workspaces/orbit-ui-mobile/orbit-drive`.

Report the state, the commit, the free worker slots and each ticket that waits on the owner.

## What the owner session does

- Writes tickets with `/ticket`.
- Answers each `needs:owner` item in a ticket comment, then removes the label. A pull request that used its 2 fix launches gets one more launch for each such comment that follows the cap report. The order carries the comment.
- Runs releases.
- Runs each `owner-work` ticket when the driver notifies.
- Starts and stops the driver.

## Rules

- The owner session writes no code for a ticket. A worker writes it.
- Only the driver merges, at the bar. Nobody uses an admin merge.
- Never edit the worktree `$HOME/orca/workspaces/orbit-ui-mobile/orbit-drive` by hand.
- Copy every ticket number, pull request number and sha from this run's output.
