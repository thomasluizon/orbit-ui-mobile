# Orbit desktop

A Tauri 2 webview loads the deployed Orbit app directly. Staging opens `https://app-staging.useorbit.org`; production opens `https://app.useorbit.org`. There is no bundled copy of the UI or local server. Requests, Server Actions and Astra streaming stay on the web app's BFF, using its secure httpOnly cookies. A persistent webview retains sign-in between launches. Separate application identifiers isolate staging and production storage.

Links requesting a new window, including invoice downloads, open HTTP and HTTPS destinations in the system browser on both platforms. Rust attaches the handler before creating the configured window. Other schemes cannot launch local files or protocol handlers. The pinned opener crate supplies only its Rust function; its plugin is never registered. The only IPC capability is native sign-in completion, restricted to the exact environment origin and main window.

## Google sign-in

Rust intercepts the deployed login screen's Google start navigation on the exact environment origin. A native verifier stays in memory; its SHA-256 challenge and a random state travel to the system browser. The existing Google start route creates a separate browser PKCE proof in an httpOnly cookie. Google keeps the existing `/auth-callback` redirect URI.

For a desktop attempt, the callback remains server-side. The BFF exchanges Google's code, then uses that session to request the API's short-lived, single-use desktop handoff. The browser returns only the handoff code and native state through `org.useorbit.desktop.staging://auth/callback` or `org.useorbit.desktop://auth/callback`. The callback contains no session token or verifier.

Rust accepts only the current in-memory attempt, the exact callback and a valid code. It posts the code, state and verifier to the same environment's BFF exchange route over HTTPS, without following redirects. The BFF performs the API exchange and returns an empty JSON body with the ordinary secure, strict same-site, httpOnly session cookies. Rust validates those headers and transfers them directly into the webview cookie store, then reloads the deployed app. A changed webview session prevents an older desktop attempt from replacing it. Native proofs expire after ten minutes and do not survive process exit; handoff codes expire at the API after sixty seconds.

The deep-link plugin registers separate environment schemes. The single-instance plugin forwards Windows protocol launches to the running shell; macOS delivers open-URL events. These plugins receive no JavaScript permissions. Cancellation and exchange failure return to the existing translated authentication failure screen. Email-code sign-in remains on the ordinary BFF path.

## Desktop lifecycle

A second launch restores the existing window, including when hidden or minimized. The single-instance plugin forwards a protocol launch to the deep-link plugin before restoring focus. macOS Dock reopen also restores the window. Closing the window hides it while the webview and session remain alive. The menu bar or system tray has Open Orbit and Quit; Quit saves window geometry and exits the process.

App navigation uses `org.useorbit.desktop://app/calendar` in production and `org.useorbit.desktop.staging://app/calendar` in staging. The `app` host accepts the known root, calendar, progress, profile, notifications, search, support, about, upgrade, wrapped and habit routes. Habit detail links require a UUID. Cross-environment schemes, unknown paths, credentials, ports, queries and fragments are rejected. The `auth/callback` host and path remain exclusive to the Google sign-in flow. Navigation links never carry a session token.

Native App (macOS) or File (Windows), Edit, View, Window and Help menus include platform editing and window actions, Orbit settings, command palette and support. Cmd/Ctrl+K and the View menu drive the web app's existing palette keyboard handler, preserving its modal focus guard. Labels use English or pt-BR according to the system language at launch; other languages use English.

Launch at login is a checkable setting under App or File and defaults to off. It reads the OS registration on each launch, changes it only when selected, and reverts the checkmark with a retry label if a change fails. The official autostart plugin uses a macOS LaunchAgent or the Windows startup registration, with distinct staging and production names. No website can enable it through IPC.

The official window-state plugin remembers size, position, maximized and full-screen state in the environment's application configuration directory. Geometry is saved on close and Quit. Hidden visibility is excluded so an ordinary launch always opens the window. The plugin checks monitor availability when restoring position. Lifecycle integrations run in Rust and grant no additional JavaScript permissions.

## Updates

The Rust updater checks at launch and every six hours while the process is running, including when its main window is hidden. It downloads and verifies the complete package before enabling Restart to update in the App or File menu and the tray. A local system notification announces availability without focusing or reloading the webview. Finish an open Astra conversation before choosing restart. Closing the window or choosing Quit never installs an update. A failed check can be retried from the menu; a failed installation retains the verified package for another explicit attempt.

Staging and production use separate `desktop-staging/latest.json` and `desktop-production/latest.json` assets under this repository's GitHub Releases downloads. Each manifest points to versioned artifacts in its own channel. The plugin verifies artifact signatures and their signed version, and accepts only newer releases. All four platform entries must belong to that channel and version. Updater and notification commands have no webview permissions.

Source configurations deliberately have empty public keys, disabling updates in development builds. Release packaging supplies each environment's actual public key in a Tauri config overlay. No private key belongs in the repository or application.

## Build

Install the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/), Rust and the repository npm dependencies. From the repository root:

```sh
npm run build:staging -w @orbit/desktop -- --no-sign --target aarch64-apple-darwin
npm run build:production -w @orbit/desktop -- --no-sign --target x86_64-apple-darwin
npm run build:staging -w @orbit/desktop -- --no-sign --target x86_64-pc-windows-msvc
npm run build:staging -w @orbit/desktop -- --no-sign --target aarch64-pc-windows-msvc
```

Build on the target operating system with the matching Rust target installed. macOS produces an app bundle; Windows produces an NSIS installer that installs WebView2 if required. Build output lives under `src-tauri/target/<target>/release/bundle`. `--debug` selects the debug output directory. These development artifacts are unsigned and are not landing-page downloads.

The `Desktop Build` workflow compiles and packages all four targets on native runners. It uploads macOS bundles as tar archives to preserve executable permissions and uploads Windows installers directly. It never opens the application, signs a release, publishes downloads or changes the web release pipeline.

## Publish an updater release

The manual `Desktop Release` workflow takes a `variant` (`staging` or `production`) and an increasing `version` with three numeric components, such as `0.2.0`. Production dispatches must use `main`. The workflow serializes each channel, tests the shell, builds all four targets, then collects macOS `.app.tar.gz` bundles and Windows NSIS `.exe` installers. Operating system signing stays off. The pinned CLI's `--no-sign` also disables updater signatures, so a separate `tauri signer sign --app-version` step signs every package after the build. The release script verifies the payload, public key, trusted comment and version before publishing.

In this repository's Settings > Environments, create `desktop-staging` and `desktop-production`. Each environment needs its own encrypted updater key pair, provisioned through the [Tauri signer](https://v2.tauri.app/plugin/updater/#signing-updates):

| Kind | Exact key | Value |
| --- | --- | --- |
| Environment variable | `TAURI_SIGNING_PUBLIC_KEY` | Complete base64 contents of that channel's `.pub` file |
| Environment secret | `TAURI_SIGNING_PRIVATE_KEY` | Complete base64 contents of that channel's encrypted private key file |
| Environment secret | `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Nonempty password for that private key |

Retain the private key and password outside the repository. Changing a public key after distributing a shell needs a key migration for existing installations. Missing credentials or a mismatched key fail the workflow before channel publication. The public key is embedded through `release-config.json`; the private key and password are exposed only to credential validation and signing steps. No Apple account or Windows signing certificate is required for this workflow.

The workflow publishes versioned files under `https://github.com/thomasluizon/orbit-ui-mobile/releases/download/desktop-<variant>-v<version>/`, with a complete four-platform `latest.json` and detached `latest.json.sig`. Only after that release succeeds does it advance the channel:

- [Staging manifest](https://github.com/thomasluizon/orbit-ui-mobile/releases/download/desktop-staging/latest.json)
- [Production manifest](https://github.com/thomasluizon/orbit-ui-mobile/releases/download/desktop-production/latest.json)

The stable channel releases must remain mutable. In repository Settings > General > Releases, keep Enable release immutability off when creating those channel releases. Versioned artifacts are never overwritten by this workflow. Every shell checks the signed artifact references in the manifest; its detached signature is also published for independent verification. The channel manifest is uploaded last so it never points to incomplete artifacts. A transient failure while replacing that asset can leave it unavailable until another publication; existing shells retain their current version and retry. A failed publication can leave a versioned release behind. Use a fresh higher version for the next dispatch, rather than replacing that version's artifacts.

Successful publication leaves four updater packages, four package signatures and both manifest files on the versioned release. Downloading a channel manifest without GitHub authentication proves the public endpoint is reachable. An installed release build then checks, downloads and offers Restart to update through its own channel. The web `release.yml` calls this workflow after the reusable Desktop Build checks the exact selected web commit. It publishes a shell update only when shell inputs differ from the last published version for that channel, then deploys web. Manual shell dispatch remains available for recovery. Landing-page downloads and notarized DMGs are separate release steps.

Icons derive from the existing web app icon with `npx tauri icon ../web/public/pwa-512x512.png --output src-tauri/icons` from this workspace. Retain only `icon.png`, `icon.icns` and `icon.ico`.

## Verification

```sh
npm run test -w @orbit/desktop
npm run type-check -w @orbit/desktop
cd apps/desktop/src-tauri
cargo check --locked
cargo test --locked
cargo clippy --locked --all-targets -- -D warnings
```

Vitest validates the merged environment and platform configurations against the installed Tauri schema, including storage, privilege constraints, callback registration and attachment of the native handlers. Web Vitest exercises browser PKCE, server-side handoff, native exchange, cookie attributes and rejected states through the actual route handlers. Its keyboard hook suite runs the desktop palette script against the existing handler, including typing targets, modal focus and disabled navigation. Rust tests inspect the generated native context and cover proof generation, callback matching, replay, superseded attempts, cancellation, expiry, cookie policies, external links, environment-bound navigation, localized catalogs, window restoration, close versus Quit, failure propagation and persistence flags without launching a browser.

These tests do not prove operating-system protocol delivery, native menu dispatch, tray interaction, login registration, monitor movement or installed-webview behavior. Those lifecycle checks, Google and email-code sign-in, persistent sessions, habit logging and Astra streaming still require installed-app acceptance on macOS and Windows. Native menu and webview screen-reader acceptance also remains an installed-app check.

## Remaining desktop work

Tracks #1560. Background reminders, web release integration, signed and notarized DMGs and landing downloads, performance comparison, installed-app recording and screen-reader acceptance belong to subsequent steps.

## Web releases and compatibility

The publisher verifies the channel manifest signature and resolves its versioned Git tag before comparing `apps/desktop`, the root package files and the desktop workflows. A missing channel starts at version `0.1.0`; an existing channel advances beyond every reserved version tag. Automatic releases retain the selected web SHA as the immutable artifact tag's target. Channel read failures and missing baseline tags stop publication. Channel jobs are serialized, including manual recovery releases.

`apps/web/web-compatibility.json` declares the minimum shell version accepted by the deployed web build. The initial floor `0.0.0` admits shells released before version discovery existed; raising it makes those shells require an update. An incompatible change must raise this floor in the same commit. Publication selects at least that version before web deployment. Rust injects its packaged version only in the main frame at the exact environment origin, without adding IPC permissions. Server rendering and hydration retain the application content; an incompatible shell switches to the update instructions after hydration.

The web bridge checks `/api/desktop-release` at launch, on focus and reconnect, and every minute. A changed web commit reloads after Astra streaming, voice input, attachments, failed sends, mutations, forms, selections and overlays settle. The one-use session-storage checkpoint retains messages, structured reply state, image previews, draft and Astra visibility for the held account. It expires after five minutes and is removed on account reset. Storage failure keeps the existing window open for a later retry. A shell below the required version shows the native menu's Check for updates and Restart to update path before the application mounts.
