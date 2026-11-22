---
name: driver-stop
description: Stop the Orbit delivery driver. A running worker ends its order first. Use on /driver-stop or stop the driver.
---

# /driver-stop

1. Run `launchctl bootout gui/$(id -u)/com.thomas.orbit-drive`.
2. Run `launchctl print gui/$(id -u)/com.thomas.orbit-drive`. "Could not find service" means it stopped. Say that in one line.

A running worker ends its order. The next `/driver-start` reads its pid file.
