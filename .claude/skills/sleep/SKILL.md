---
name: sleep
description: Set the driver's sleep mode. /sleep turns it on, so nothing pings the owner and held decisions get answered alone. /sleep off turns it off. Use on /sleep, I am going to sleep, good night, or I am back.
argument-hint: "[off]"
---

# /sleep

1. Run `node tools/drive.mjs --sleep on` for `/sleep`, or `node tools/drive.mjs --sleep off` for `/sleep off`, in `$HOME/orca/workspaces/orbit-ui-mobile/orbit-drive`.
2. For `/sleep`, run `/questions --auto` next. Every held decision gets answered or decided now, so the driver has work all night.
3. For `/sleep off`, run `/questions`. It asks the owner the questions that were queued for him.
4. Say the state that the command printed, in one line.

Sleep normally stays on. The driver then sends no notification and keeps working. Each morning `/driver` lists every notification it held, and `/questions` asks what was left for the owner.
