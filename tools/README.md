# tools

Run the tests with `node tools/test-tools.mjs [--only <module>]`. Read `tools/CONVENTIONS.md` before you add a tool.

## Delivery driver

- `drive.mjs`: the delivery driver. Each tick it reads GitHub, acts on every open pull request and fills every free worker slot. It runs workers on two Claude accounts: the main account and the worker account (`CLAUDE_CONFIG_DIR=$HOME/.claude-orbit-workers`). Each account has its own pace line, its own 90% stop and its own `--allow-over-limit [main|worker]`.
- `lib/driver-pin.mjs`: the commit that the driver worktree holds, and the crash count of a new version.
- `lib/worker.mjs`: starts and watches one headless worker.
- `lib/worker-gate.cjs`: the child process that starts the worker after the driver sends its release message.
- `lib/order.mjs`: writes the order that a worker receives from a ticket.
- `lib/github.mjs`: the one GitHub adapter of the driver: reads, the merge bar and every write.
- `lib/config.mjs`: reads `.claude/orchestrator.json` and builds the environment of a worker.
- `lib/github-auth.mjs`, `lib/github-read.mjs`, `lib/github-rate-limit.mjs`: GitHub accounts, bounded reads and the rate limit floor.
- `lib/bounded-process.mjs`: runs a child process with a time limit and an output limit.
- `lib/git-worktrees.mjs`: lists worktrees and removes them safely.
- `lib/parity-scope.mjs`: the path rule that decides when a change needs web and mobile parity.
- `lib/attribution-lines.mjs`: finds attribution lines in a message.
- `lib/escape-regex.mjs`: escapes text for a regular expression.
- `create-ticket.mjs`: creates one ticket, adds it to the board and sets its Status.

## Product gates

- `check-copy.mjs`, `check-dashes.mjs`, `check-gradients.mjs`, `check-i18n-usage.mjs`, `check-retired-name.mjs`: copy, dash, gradient, translation key and retired name checks.
- `check-hermetic-web-build.mjs`, `check-native-module-copies.mjs`, `check-android-bundle.mjs`: build and bundle checks.

## Release and devices

- `release-plan.mjs`: plans a production or staging release.
- `wait-release.mjs`: waits for one release run and checks the deployed commit.
- `testflight-access.mjs`, `lib/app-store-connect.mjs`: App Store Connect access for TestFlight.
- `android-boot.mjs`, `android-emulator.mjs`, `ios-simulator.mjs`: start and drive the local devices.
- `generate-brand-assets.mjs`: builds the brand images.
- `select-artifact-attempts.mjs`: picks the artifact of a build attempt.
- `orca-web-port.mjs`: derives the web port of a worktree.
- `desktop-bench/`: the desktop acceptance run.
- `arch-map.mjs`: writes the architecture map on demand.
