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

## Installed VM acceptance

`desktop-acceptance.yml` owns installed-shell acceptance on disposable GitHub macOS and Windows
VMs. Its CLI is `node tools/desktop-bench/acceptance.mjs --output <absolute-directory-outside-repository>`.
The CLI requires the GitHub Actions environment and never runs as part of local verification.
It reuses the benchmark build entry, process host, hermetic fixture producer, mock request handler
and proxy. The release build uses the same staging prepare and package commands as
`desktop-release.yml`, with no optional Cargo features and no deployed credentials.

The job generates an ephemeral root certificate and Tauri key. It maps the shell's exact web and
update hosts to loopback, trusts the root in the VM's system store, and checks DNS before launching.
On macOS a separate listener uses passwordless `sudo` to bind loopback port 443, then clears its
supplementary groups and drops to the runner's user and group before accepting connections. It
forwards the encrypted stream to the user's TLS proxy on port 3443. Binding that listener is the
443 preflight; conflicts and permission errors retain their original errno. The app, proxy and
builds run as the ordinary runner user. Cleanup closes the listener through its input pipe.
Windows binds its TLS proxy directly to port 443 with the runner's existing privileges.
The hermetic builder accepts `HERMETIC_DESKTOP_ORIGIN` for its compiled site and event origins;
ordinary layout and benchmark builds retain their loopback defaults. TLS, channel validation,
origin capabilities and signature verification remain active. The proxy forwards cookies without
seeding an authenticated session. Email code requests run inside the installed webview through
the real BFF, against the mock's fixed email and code. The report requires both protected cookies
and an authenticated request. No deployed API or account is used.

macOS installs from the mounted DMG into the Applications directory. Windows runs the built NSIS
installer with its silent flag and explicit install directory. Only that installed executable is
launched. The first launch checks Hoje, Astra, palette structure and native clean quit. Separate
launches reject a cryptographically corrupted signature and download a correctly signed newer
version. The update package is the built acceptance installer, signed with the newer advertised
version to exercise the verifier. The job tests discovery and download verification; it does not
install that update. The channel manifest also receives a detached signature. Tauri validates the
manifest's platform signature against the downloaded bytes and signed version; its protocol does
not consume a detached manifest signature. The final native restart prompt is left unanswered and
that process is stopped during cleanup.

Recording starts before native and web builds and continues through installed checks. macOS discovers
its actual AVFoundation screen index from ffmpeg; Windows captures the desktop with gdigrab. The job
requires capture output, a nonempty MP4 and successful full decoding. Device enumeration and capture
logs accompany the video. Setup before the recording tool is available is outside the recording.

Platform readers dump the real AX or UI Automation tree and require web content, interactive
controls, semantic roles and nonempty names. Palette arrows must retain input focus and expose the
next selected result in both the DOM and platform tree. An exact macOS access denial is recorded as
a skip, with Windows still required. These are structural checks; a person's spoken screen reader
pass remains separate. Reports, native trees, capture and diagnostic logs upload even on failure.
Keys, session fixtures and build packages are excluded from the artifact paths. Cleanup stops owned
processes, restores hosts and trust, and removes the hermetic web build. Cleanup failure fails the job.

Every capture retains the complete raw tree before validation. UIA records include automation,
class and framework identifiers, visibility, enabled and focusable state, bounds, localized type
and control/content-view membership. Non-finite rectangle components are written as JSON `null`.
Nodes explicitly outside both UIA assistive views (`IsControlElement=false` and
`IsContentElement=false`) are excluded from control validation, as defined by the
[UIA tree contract](https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-treeoverview).
Controls explicitly marked `IsOffscreen=true` are also excluded, following the
[UIA visibility property](https://learn.microsoft.com/en-us/dotnet/api/system.windows.automation.automationelement.automationelementinformation.isoffscreen).
Names and rectangle values never determine visibility. Visible disabled controls still require
their role and name. A document with no visible interactive descendants fails even if browser
chrome contains valid controls. The VM jobs exercise the PowerShell rectangle producer before
building the installed app.

Probe failures retain the error message separately from the stack because a webview stack may
contain only frames. Email failures include the BFF path, HTTP status and response body, including
any error code. The mock logs receipt of both email endpoints without recording request bodies.

AX records retain supported identifiers, DOM identifiers and classes, subroles, role descriptions
and hidden state. The SDK's `AXError.h` defines `kAXErrorInvalidUIElement` (`-25202`) as an invalid
element reference. A failed read with that code discards the traversal and creates a new application
element for one complete retry. The discarded partial tree remains in `attempts`; a repeated invalid
element or any other read error fails with its role, path and node record. Failed captures preserve
their partial nodes and error in the artifact instead of passing validation.

The installed acceptance regressions, including compiled AX traversal with injected API failures,
run with `node tools/test-tools.mjs --only desktop-acceptance`. This command never launches the app.
