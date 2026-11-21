---
name: sleep
description: Steer the delivery driver. /sleep sets sleep mode on, so the driver asks the owner nothing and keeps working. /sleep off sets it off, and the driver sends one list of what waited. Use when he says /sleep, I am going to sleep, good night, or I am back.
argument-hint: "[off]"
---

# /sleep

The delivery driver runs the board. This skill only sets its sleep mode. It starts no worker, no loop and no waiter.

1. Run `node tools/drive.mjs --sleep on` for `/sleep`. Run `node tools/drive.mjs --sleep off` for `/sleep off`.
2. Run the command in the driver worktree `~/orca/workspaces/orbit-ui-mobile/orbit-drive`.
3. The command prints the state it reads back. Say that state to the owner in one line.

With sleep on, the driver asks the owner nothing and keeps working.
With sleep off, the driver sends one list of what waited.

Read the board with `node tools/drive.mjs --dry-run`. Read the log in `~/Library/Logs/brain-automations/orbit-drive.log`.
