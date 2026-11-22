---
name: driver-status
description: Say whether the driver runs, what it builds now, why it waits, how much of each Claude account's week is used, and what decisions are held. Use on /driver-status, is the driver running, or why is nothing happening.
---

# /driver-status

1. Run `launchctl print gui/$(id -u)/com.thomas.orbit-drive`. Read the state and the pid.
2. Read the last 50 lines of `$HOME/Library/Logs/brain-automations/orbit-drive.log`.
3. Run `node tools/drive.mjs --dry-run` in `$HOME/orca/workspaces/orbit-ui-mobile/orbit-drive`.

Report in this order, in product terms:

1. Running or stopped. Launchd starts the driver at each login, so a restart of the Mac needs nothing.
2. What a worker builds now.
3. The week used on each account (the `pace` line) and whether it stopped at 90%. `/over-limit` lets it go on.
4. The held decisions (`needs:owner`), counted. `/questions` answers them.
5. What else waits, grouped: blocked by launch, blocked by another ticket, owner-work.

Write no ticket or pull request numbers.
