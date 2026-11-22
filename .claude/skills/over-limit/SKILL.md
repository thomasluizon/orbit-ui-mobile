---
name: over-limit
description: Let the driver keep working past the 90% weekly stop of a Claude account, with 1 worker, until that account's week resets. Use on /over-limit, go over the limit, or keep going past 90%.
argument-hint: "[main|worker]"
---

# /over-limit

1. Run `node tools/drive.mjs --allow-over-limit` in `$HOME/orca/workspaces/orbit-ui-mobile/orbit-drive`. Add `worker` to allow the worker account instead. With no word it allows the main account.
2. Say in one line the time it printed. The allowance ends at that time, when the account's week resets.

The running driver reads the allowance on its next tick. It needs no restart.
