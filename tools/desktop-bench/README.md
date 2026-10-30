# Desktop performance acceptance

> **At a glance** - measures the Orbit workload in unsigned native release shells against one hermetic web build.

```sh
node tools/desktop-bench/run.mjs --output <absolute-directory-outside-repository>
```

Run from any directory on macOS or Windows after `npm ci`. Rust, Node and native desktop
build prerequisites must be installed. macOS needs command line developer tools; the runner
also locates Homebrew's keg-only rustup. No signing account or key is needed.
Electron and its packager install only in the temporary output workspace, outside the repository.
The current stable Electron version is resolved from npm and recorded in the report.

The Tauri release uses `bench-loopback` and a temporary config overlay. The feature is off by
default. Only the overlay grants local capabilities, selects the separate benchmark app identifier
and selects a 900-pixel window width, where Hoje provides its inline composer. Electron uses
the first Tauri run's measured content viewport; every later run must match it exactly.
The measured dimensions are retained in JSON. Shipped configs and release workflows stay unchanged.
The Rust test rejects loopback without the feature; the tools harness guards release configurations.

Only loopback ports 5099, 3400 and 3401 are used. Occupied ports fail before starting processes.
The hermetic web build and mock API use existing repository scripts. A loopback proxy supplies an
httpOnly session from `mintHermeticJwt`, seeds 200 habits using the shared schema and fixture producer,
and injects the same nonce-bearing probe into both shells. No regular browser or automation framework
runs. The normal Hoje composer sends through the BFF. The mock emits the API's `started`, `delta`,
`final` protocol with 80 ms pacing, only for the benchmark session when explicitly enabled.
The API producer is `ChatController.StartEventStreamAsync`, `WriteEventAsync` and `ChatStreamEvent`;
the shared consumer is `packages/shared/src/chat/sse-stream.ts`.

Five independent cold/warm pairs per shell are required; `--runs` may increase the count.
Shell order alternates per pair. Cold clears benchmark webview storage and HTTP cache; warm
retains it after a complete process exit. Neither purges OS filesystem caches or restarts the
prewarmed server. These are storage-cold and storage-warm launches, not cold boots. Keep the
visible windows unobstructed during measurement.

First usable means the first habit has painted and the hydrated composer accepts focus.
The page then waits on a long-lived command request while the host collects process-tree RSS
at 10 seconds and 60 seconds, plus CPU-time change over the idle interval. CPU is an energy proxy,
not watts. Raw process membership and timestamps accompany every sample. On macOS the system
responsibility API attributes launchd-hosted WebKit content, GPU and network processes to their app,
alongside normal descendants. A native launcher disclaims inherited responsibility. No root access
is used. Windows introspects the `Win32_Process` CIM schema before reading descendant counters.

Scrolling advances the real shell scroller 120 pixels per animation frame to the end of the
200-habit list and verifies the last row. JSON retains every frame interval; summaries report
the median per-run p95 and count above 16.7 ms. Streaming measures real composer submission to
first rendered token and final rendered text; request dispatch and final-event times are retained.
Fixture pacing measures transport and rendering, not model latency.

`summary.json` holds raw samples and medians; `summary.md` presents the comparison. `partial.json`
preserves complete runs on failure. Build logs and unsigned bundles remain under the output workspace.
Installed size counts the packaged application payload's logical regular-file bytes, excluding
duplicate symlink targets and Windows uninstaller or first-launch runtime caches. macOS artifacts
are compressed DMGs. Signing does not change runtime cost. The measurements do not prove feature
parity, accessibility, notarization or the other operating system's results.
Disk medians use five scans of each immutable release artifact, not five separate rebuilds.

The tool stops its servers and shells on success, failure or interruption and removes its own
`apps/web/.next` output. It refuses to replace an existing build. Forced OS termination cannot
run cleanup; inspect owned processes and ports before retrying. CI runs the same command on
both operating systems and uploads summaries and logs without publishing desktop releases.

Focused parsing, summary, origin and stream checks run under `node tools/test-tools.mjs --only desktop-bench`.
