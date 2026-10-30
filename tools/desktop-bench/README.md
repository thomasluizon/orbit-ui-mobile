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
and requests a 900×600 CSS viewport, where Hoje provides its inline composer. Both shells must
report exactly that viewport. Only the readiness launch may fit Tauri's window by the page's
measured CSS shortfall, including insets inside the native webview frame. It returns the calibrated
logical native size through the benchmark command. Every measured launch receives that size through
`ORBIT_BENCH_WIDTH` and `ORBIT_BENCH_HEIGHT` before window creation, skips restored geometry and rejects
any viewport mismatch without resizing or native IPC. Electron retains its content-size launch path.
JSON retains `nativeWindow` (the logical native size request) beside `viewport`, including readiness.
Shipped configs and release workflows stay unchanged.
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
Both shells pass a readiness launch before timed collection; these launches are excluded from medians.
Shell order alternates per pair. Cold clears benchmark webview storage and HTTP cache; warm
retains it after a complete process exit. Neither purges OS filesystem caches or restarts the
prewarmed server. These are storage-cold and storage-warm launches, not cold boots. Keep the
visible windows unobstructed during measurement.

First usable means the first habit has painted and the hydrated composer accepts focus.
The page then waits on a long-lived command request while the host collects process-tree RSS
at 10 seconds and 60 seconds, plus CPU-time change over the idle interval. CPU is an energy proxy,
not watts. Raw process membership, native accounting counters and timestamps accompany every sample.
CPU totals include exited members, including children born and terminated between samples. Live
member CPU counters are diagnostic only; they never supply the idle total.

Windows creates the shell suspended, assigns it to a Job Object before resuming it, and disallows
breakaway. `JOBOBJECT_BASIC_ACCOUNTING_INFORMATION.TotalUserTime` and `TotalKernelTime` retain CPU from
both live and terminated members, including nested jobs. The same job supplies live PIDs for RSS,
and closing its last handle kills its processes. PowerShell compilation and job creation precede
the native launch timestamp and do not enter startup timing. See the
[job accounting contract](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-jobobject_basic_accounting_information)
and [job inheritance contract](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects).

macOS launches each packaged app through `NSWorkspace` with a fresh application instance and the
benchmark environment. It requires a resource coalition separate from the runner. The kernel's
coalition CPU counter sums live-task ledgers and the retained ledgers of dead tasks. Its Mach ticks
are converted using `mach_timebase_info`. Live RSS comes from `ps`, with coalition membership and
responsibility attribution for launchd-hosted WebKit content, GPU and network processes. A live
descendant in a different coalition fails accounting. No root access is used. The native helper
terminates its isolated coalition on stop or input closure. The ABI prefix and dead-task rollup
are defined in [XNU's coalition interface](https://github.com/apple-oss-distributions/xnu/blob/main/osfmk/mach/coalition.h)
and [coalition accounting](https://github.com/apple-oss-distributions/xnu/blob/main/osfmk/kern/coalition.c).

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
