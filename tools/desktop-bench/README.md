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
The Electron archive download retries GitHub server errors, rate limits and connection failures four times, after 15,
30, 60 and 120 seconds. The archive is cached in a directory named by its SHA-256 from the electron package's
`checksums.json`, and `@electron/get` verifies that checksum on every cache hit. The workflow restores that cache with a
key of the resolved version, operating system and architecture, and passes `ORBIT_ELECTRON_VERSION` and
`ORBIT_ELECTRON_CACHE` to the run.

The Tauri release uses `bench-loopback` and a temporary config overlay. The feature is off by
default. Only the overlay grants local capabilities, selects the separate benchmark app identifier
and requests a 900×600 CSS viewport. That is the compact shell, where Hoje shows the Astra button. Both shells must
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
schedules them on the start day and the next day, so a run that crosses midnight keeps them on Hoje,
and injects the same nonce-bearing probe into both shells. No regular browser or automation framework
runs. The Hoje Astra button opens the conversation, and its composer sends through the BFF. The mock emits the API's `started`, `delta`,
`final` protocol with 80 ms pacing, only for the benchmark session when explicitly enabled.
The API producer is `ChatController.StartEventStreamAsync`, `WriteEventAsync` and `ChatStreamEvent`;
the shared consumer is `packages/shared/src/chat/sse-stream.ts`.

Five independent cold/warm pairs per shell are required; `--runs` may increase the count.
Both shells pass a readiness launch before timed collection; these launches are excluded from medians.
Shell order alternates per pair. Cold clears benchmark webview storage and HTTP cache; warm
retains it after a complete process exit. Neither purges OS filesystem caches or restarts the
prewarmed server. These are storage-cold and storage-warm launches, not cold boots. Keep the
visible windows unobstructed during measurement.

First usable means the first habit and the Astra button have painted, and the hydrated Astra button opens the conversation.
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
the median per-run p95 and count above 16.7 ms. Streaming measures real conversation composer submission to
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

The Windows job and a fork pull request's macOS job build with `--no-sign`. A workflow dispatch or a
pull request from this repository runs macOS in the separate `installed-signed` job instead. That job
takes the `desktop-staging` environment with `deployment: false`, and the Windows job takes no
environment. GitHub passes no secrets to a workflow that a fork triggers, so a fork pull request gets
no signing material and keeps the unsigned APNs skip. The signed build follows `desktop-release.yml`:

- `tauri build --no-bundle` compiles the shell without signing credentials.
- The harness writes the Developer ID provisioning profile into a signing config overlay. It requires
  that the profile names the `com.apple.application-identifier` from `Entitlements.staging.plist`.
- `tauri bundle` imports the PKCS#12 certificate, signs the app and DMG with the hardened runtime and
  `Entitlements.staging.plist`, and signs the updater archive with this run's generated key.

`acceptance.mjs` removes `MACOS_DEVELOPER_ID_CERTIFICATE_BASE64`,
`MACOS_DEVELOPER_ID_CERTIFICATE_PASSWORD`, `MACOS_PROVISIONING_PROFILE_BASE64` and
`MACOS_SIGNING_IDENTITY` from `process.env` first. Only the bundle step receives them, as Tauri's
`APPLE_*` variables. Part of the set fails the job. Notarization is not part of acceptance, because
the runner installs the app locally. `report.json` `signing` keeps the public identity or the reason
for an unsigned build.

The job generates an ephemeral root certificate and Tauri key. It maps the shell's exact web and
update hosts to loopback, trusts the root in the VM's system store, and checks DNS before launching.
The resolver is refreshed once after replacing hosts, then both names are polled without further
cache purges for up to 30 seconds. macOS failures capture the hosts tail, permissions and extended
attributes, resolver configuration, host lookup and two minutes of daemon logs before restoring
hosts. The `origin-isolation-*.log` artifacts include command failures alongside the isolation error.
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
not consume a detached manifest signature. The final native restart prompt is left unanswered. The
push phase stops that process and serves no update before it launches the shell again.

### Repeat reminder push

The push phase proves the desktop Done action with a real push service. The runner relaunches the
installed shell, and the probe turns on the real Perfil Notificações switch. The mock API records the
registration and lists it with the API's endpoint hash, so the switch reaches its registered state.
The runner then sends a repeat reminder to the recorded channel or device token. Its payload copies
orbit-api `ReminderSchedulerService.Repeat.cs` `RecordRepeat`, `PushNotificationService.CreateWebPushPayload`
and `ApnsPushSender.CreatePayload`, with a one-use token that the mock issues.

- Windows: the build compiles `ORBIT_DESKTOP_WNS_OBJECT_ID`, the shell creates a WNS channel, and the
  runner sends a `wns/raw` notification with a client-credentials token for `https://wns.windows.com/.default`.
  It sends that token only to an `https` `notify.windows.com` channel, as `WnsEndpointPolicy` does.
- macOS: APNs needs `com.apple.developer.aps-environment` in the installed code signature. The runner
  reads it with `codesign`, parses the plist with `plutil`, selects the sandbox or production host from
  its value, and signs an ES256 provider token. An unsigned build without the key is a skip that names
  the missing signing material. A Developer ID signed build without the key fails the job. Output that
  `plutil` cannot parse, or an unknown key value, fails the job with the raw output lengths and first
  bytes. The macos-latest image leaves `com.apple.apsd` and `com.apple.notificationcenterui.agent`
  unloaded. Then `apsctl status` answers "Connection invalid", no authorization alert shows and no APNs
  token arrives. An `open -b` start of Notification Center does not help, because launchd vends no
  service for it. Thus, before it turns on the Perfil switch, `startPushServices` in
  `acceptance-platform.mjs` loads both services through launchd, as a login does. For `com.apple.apsd`
  in the `system` domain and `com.apple.notificationcenterui.agent` in the `gui/<uid>` domain, it runs
  `launchctl enable`, then `bootstrap` only when `launchctl print` cannot find the service, then
  `kickstart`. The image also keeps one apsd device identity in `/Library/Keychains/apsd.keychain`, so
  every runner presents the same token. The courier rejects it, apsd rolls it, and the reminder push
  then arrives for "a completely unknown token" that apsd discards. Thus apsd always starts without
  that keychain: a loaded apsd is first stopped with `launchctl bootout`, then `sudo rm -f` removes the
  keychain before `bootstrap`. apsd creates a new keychain and gets a new public token from the courier.
  It waits until `apsctl status` shows `daemon status: Running` and `connection status: Yes`,
  and until the `NotificationCenter` process runs. `report.json` `pushServices` keeps the apsd status
  lines. If apsd never reaches the courier, the error keeps the last status lines instead.
  The runner allows the first authorization alert through AX. The alert leaves the screen once it is
  allowed, so `report.json` `push.authorization` records whether a search found and invoked it.

Microsoft's app notification quickstart states that app notifications are not supported for elevated
apps. The Windows App SDK makes this decision from the token integrity level only: `AppNotificationManager::IsSupported`
is false at `SECURITY_MANDATORY_HIGH_RID` or above (`dev/Common/Security.IntegrityLevel.h`). The Windows
harness runs at High integrity, because it edits the hosts file and the machine root store. A scheduled
task with `-RunLevel Limited` still gave the runner account a High token. A copy of the harness token
with only its integrity level lowered keeps the Administrators group and the admin privileges, and
WebView2 fails under it with "failed to create webview" and HRESULT `0x80010108`. Thus `windows-unelevated.ps1`
computes a standard-user token from the harness token with
[`SaferComputeTokenFromLevel`](https://learn.microsoft.com/en-us/windows/win32/api/winsafer/nf-winsafer-safercomputetokenfromlevel)
at `SAFER_LEVELID_NORMALUSER`, as `runas /trustlevel:0x20000` does. That level makes the Administrators
group deny-only and removes the admin privileges. The token then takes an explicit Medium label
(`S-1-16-8192`), and `CreateProcessAsUser` starts a PowerShell launcher with it, as Microsoft's
[low integrity guide](https://learn.microsoft.com/en-us/previous-versions/dotnet/articles/bb625960(v=msdn.10))
shows. The launcher inherits the harness desktop, so the shell stays in the runner's interactive session.
The launcher removes the proxy variables and starts the shell, which inherits the standard-user token. The shell
writes stderr to `<launch>.log` and stdout to `<launch>.stdout.log`. `Add-Type` compiles through CodeDom,
which fails at Medium integrity with "A required privilege is not held by the client". Thus the High start
mode compiles the token helper into `OrbitIntegrity-<id>.dll` in the output directory, and the Medium
launcher only loads that library. A launcher that cannot load it writes the error to its status file.

Before each launch, the harness grants the user SID modify access to the output directory. It also gives
the directory and every file in it an explicit, inherited Medium label with `icacls /setintegritylevel`.
Mandatory Integrity Control refuses a write from Medium to a High object, so this label lets the Medium
launcher and shell create and append to their logs and status file. `<launch>-launch.jsonl` keeps the
launcher's token, the shell's process ID and token, and its exit code. Each token record names the user,
the SID, the last SID subauthority (500 for the built-in Administrator), the integrity level, the
`TokenIsElevated` value, the state of the Administrators group (`S-1-5-32-544`: `enabled`, `denyOnly`,
`disabled` or `absent`) and the session. `TokenIsElevated` stays true for the standard-user token of the
built-in Administrator, so the real launch test asserts that the Administrators group is not `enabled`. `report.json` `launchContexts` keeps these records for the shell,
the launcher and the harness, and the output directory label. A shell at High integrity or above fails
the job. When the launcher cannot read the shell token, the launcher's token decides, because the shell
inherits it.

The first unsupported push answer in each shell process writes one stderr line, which names the native
branch: `manager=null`, or the `AppNotificationManager.Setting()` value and `PushNotificationManager.IsSupported()`.
The line also names the integrity level that the Windows App SDK reads, whether that level counts as
elevated, and `TokenIsElevated`. On macOS the line names the missing APNs entitlement. The runner gathers these
lines from every launch log into `report.json` `push.nativeUnsupported`, and copies the earlier
launches' lines into `push.log`.

The runner hides the main window through its close control and invokes Done on the system
notification through UIA or AX. If the banner is gone, the reader opens the notification list once.
On Windows, the GitHub image turns Do not disturb on, which holds every banner back, and the
notification center lists the toast collapsed. Windows + N opens that center and moves keyboard focus
into it. The reader searches the UIA root windows, every visible top-level window of a process that
runs from the Windows directory, and the top-level ancestor of the focused UIA element. It walks the
top-level windows with `FindWindowEx`, because the `EnumWindows` reference says that function lists
only the windows of desktop apps, and the open center never appeared in an `EnumWindows` walk. Where a
title has no Done action, it expands the collapsed entries in the toast and searches again. Each
Windows reply names the `ToastNotificationManagerForUser.NotificationMode`, and `report.json`
`push.notificationMode` keeps the first one.
Each Windows reply also reads the notification history of the shell's AUMID. The Windows App SDK
keeps an unpackaged app's AUMID in the `NotificationGUID` value under
`HKCU\Software\Classes\AppUserModelId\<executable path with each backslash replaced by a dot>`.
`report.json` `push.history` keeps, for each search, the first reply that found the toast in that
history, or else the last reply, so the report says whether the shell posted the toast at all.
The mock must record exactly one habit log for that habit, and the app window must stay hidden.

The second check sends another reminder and stops the shell while its notification is visible.
From the push launch on, the mock refuses the long-lived sign-in token, so the BFF refreshes it into
65 second tokens. After the shell stops, the mock also refuses the refresh token. A Done on that
notification launches the shell. The runner finds and adopts that process before it waits for the
sign-in page, so cleanup stops it on every outcome. Its first page load finds a due token, fails the
refresh and goes to sign-in, which must show in a visible window. The mock must record no habit log
for that reminder.

Each run keeps the platform evidence that the notification readers use, also when a match fails:

- `codesign-entitlements.stdout.log` and `codesign-entitlements.stderr.log` keep the raw macOS
  `codesign -d --entitlements - --xml` output.
- `trees/notification-*.json` keeps the last reply of each notification search. On Windows, a reply
  holds the candidate windows with their source (`automation`, `system` or `focus`), the AUMID
  history and, after a match, the UIA subtree of the toast that holds Done.
  A host that shows the title without one Done action keeps its UIA subtree in `titled`.
  On macOS, a reply holds the AX tree of `com.apple.notificationcenterui`, and
  `trees/notification-authorization.json` keeps the tree from the authorization alert search.
  `trees/notification-authorization-found.json` keeps the reply of the search that found the alert.
- On macOS, after the push phase, `push-apsctl-status.log` keeps the whole `apsctl status` with the
  device token bytes redacted. `report.json` `pushDiagnostics.apsdApplication` keeps the apsd block that
  lists the shell's topic. For an app alert topic that block is usernoted's, which opens with `process:`
  because it has no port name. It holds the topic category, the incoming pushes per topic and the pushes
  that apsd gave to the process. `push-unified.log` keeps the unified log of `apsd`, `usernoted`,
  `NotificationCenter`, `orbit-desktop` and the `com.apple.UserNotifications` subsystem from the start
  of the phase. Together they show whether a reminder reached the device, reached the shell, or was
  not presented.

On macOS, APNs answers HTTP 200 when it accepts a push, not when the device receives it. Before each
reminder the phase reads apsd's incoming push count for the shell's topic, and after the send it waits
up to 60 seconds for that count to rise. `report.json` `push.doneReceipt` and `push.expiredReceipt`
keep the counts and the seconds that each push took. A push that apsd never counts fails the phase with
the counts and the last arrival, before any Notification Center search.

The macOS reader presses the menu bar clock to open Notification Center only while the center is closed.
The press toggles the center, and only the open center lists its history and the Edit Widgets button.

On Windows, right after the Done invoke, `trees/notification-done-activation.json` keeps the token
integrity and elevation of `explorer`, `ShellExperienceHost`, `sihost` and the per-user
`WpnUserService`, and every running shell instance with its command line. `report.json`
`push.activation` keeps a summary. A Done habit log that never arrives keeps a second capture in
`trees/notification-done-activation-timeout.json`, and the failure names the host levels and the
instance count. COM gives a server it launches the activator's token, and a process that UAC elevated
does not load per-user COM classes. The Windows App SDK registers an unpackaged app's activator per
user, and it refuses app notifications in an elevated process. Thus elevated shell hosts mean that a
toast click cannot reach the shell. `push.log` holds the shell's own lines: `Desktop push: notification
Done activation received` when a click reaches the running shell, and `a notification activation
started a second process` when Windows started a new instance instead.

`mock.log` names every acceptance route that the shell or the BFF reached, with its status, such as
`POST /api/reminders/done 200`. The harness's own `GET /_test/` polls stay out of it.

Push credentials come only from the job environment. `acceptance.mjs` removes them from
`process.env` before any build or server starts, and the report keeps the WNS host or the token
length, never the channel or token. An unsigned macOS build, or a missing credential, is a skip with
its reason in `report.json` `push.skipped` and in a job warning. Windows registration runs without
the client secret.

Recording starts before native and web builds and continues through installed checks. macOS discovers
its actual AVFoundation screen index from ffmpeg; Windows captures the desktop with gdigrab. The job
requires capture output, a nonempty MP4 and successful full decoding. Device enumeration and capture
logs accompany the video. Setup before the recording tool is available is outside the recording.

Platform readers dump the real AX or UI Automation tree and require web content, interactive
controls, semantic roles and nonempty names. Palette arrows must retain DOM input focus and expose the
next selected result in both the DOM and platform tree. Platform focus may be on the input or its
selected active descendant inside the controlled listbox, matched by captured automation identifiers.
The page records each keydown the palette receives. A native Down counts as sent only when the page
records an ArrowDown that the input method did not claim. WebKit marks a claimed key with key code 229
or a composition, and cmdk ignores it. If the page records no usable ArrowDown within 5 seconds, the
runner sends the Down again, with at most 3 posts per step. The report keeps each undelivered Down and
the keys the page recorded for it in `paletteUndelivered`. A step that records two usable ArrowDown keys
fails. A received Down that does not move the selection still fails the focus check.

On macOS, the AX helper sends every key as a real keyboard does. It posts the key at the HID event tap,
where HID events enter the window server, and the window server gives it to the focused application.
The helper first reads the focused application from the system-wide AX element. If the installed process
is not focused, the helper requests activation and sets `AXFrontmost`, because macOS 14 lets the system
refuse an activation request. If another process keeps keyboard focus, the helper posts no key and names
that process. `report.json` `keyDelivery` keeps each key reply with its delivery path, its activation and
the focused process. While Astra is open, the page records each keydown in `astra-key` events. If Astra
does not close after the native Escape, the runner keeps those events in `report.json` `astraKeys` and
the AX tree in `trees/astra-after-escape.json`. The error states how many Escape keydowns the page received.
An exact macOS access denial is recorded as
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
