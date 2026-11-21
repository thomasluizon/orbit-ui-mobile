---
name: ios-generate
description: Build the current checkout as Orbit Staging for an iPhone simulator, install it and open it in Xcode Device Hub. Use for a fresh local iOS build or /ios-generate. For TestFlight publishing use /ios-release.
---

# iOS Generate

Run from the repository root, as a background task:

```bash
node tools/ios-simulator.mjs
```

- Pass `--device <udid>` to choose an installed iPhone. Without it, the tool prefers a booted iPhone.
- Pass `--app-version <x.y.z>` to choose the version and skip the lookup of the newest staging Android deployment.
- The tool prints its own requirements and errors. Read them.

Report the exit code, the elapsed time, the simulator name and identifier, the bundle id, the version, and whether the process still runs after 5 seconds. An early exit is a failure, even when the install worked.

Leave the simulator alone after the owner starts to use it. Never sign in as part of this skill.
