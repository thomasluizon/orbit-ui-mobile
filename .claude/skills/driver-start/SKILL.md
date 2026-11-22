---
name: driver-start
description: Start the Orbit delivery driver. It runs until /driver-stop, a logout or a shutdown, and never starts by itself at login. Use on /driver-start, start the driver, or after the Mac turns on.
---

# /driver-start

1. When `$HOME/orca/workspaces/orbit-ui-mobile/orbit-drive` is missing, run `git -C $HOME/Developer/orbit-ui-mobile fetch origin main`, then `git -C $HOME/Developer/orbit-ui-mobile worktree add --detach $HOME/orca/workspaces/orbit-ui-mobile/orbit-drive origin/main`.
2. Run `launchctl bootstrap gui/$(id -u) $HOME/Developer/brain/scripts/automations/on-demand/com.thomas.orbit-drive.plist`. An "already loaded" error means it runs.
3. Run `/driver-status` and say its first line.

Never copy the plist into `$HOME/Library/LaunchAgents/`: from there it starts at every login.
