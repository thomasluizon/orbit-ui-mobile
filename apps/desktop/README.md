# Orbit desktop

A Tauri 2 webview loads the deployed Orbit app directly. Staging opens `https://app-staging.useorbit.org`; production opens `https://app.useorbit.org`. There is no bundled copy of the UI or local server. Requests, Server Actions and Astra streaming stay on the web app's BFF, using its secure httpOnly cookies. A persistent webview retains sign-in between launches. Separate application identifiers isolate staging and production storage.

Links requesting a new window, including invoice downloads, open HTTP and HTTPS destinations in the system browser on both platforms. Rust attaches the handler before creating the configured window. Other schemes cannot launch local files or protocol handlers. The pinned opener crate supplies only its Rust function; its plugin is never registered. No IPC capabilities are granted.

## Google sign-in

Rust intercepts the deployed login screen's Google start navigation on the exact environment origin. A native verifier stays in memory; its SHA-256 challenge and a random state travel to the system browser. The existing Google start route creates a separate browser PKCE proof in an httpOnly cookie. Google keeps the existing `/auth-callback` redirect URI.

For a desktop attempt, the callback remains server-side. The BFF exchanges Google's code, then uses that session to request the API's short-lived, single-use desktop handoff. The browser returns only the handoff code and native state through `org.useorbit.desktop.staging://auth/callback` or `org.useorbit.desktop://auth/callback`. The callback contains no session token or verifier.

Rust accepts only the current in-memory attempt, the exact callback and a valid code. It posts the code, state and verifier to the same environment's BFF exchange route over HTTPS, without following redirects. The BFF performs the API exchange and returns an empty JSON body with the ordinary secure, strict same-site, httpOnly session cookies. Rust validates those headers and transfers them directly into the webview cookie store, then reloads the deployed app. A changed webview session prevents an older desktop attempt from replacing it. Native proofs expire after ten minutes and do not survive process exit; handoff codes expire at the API after sixty seconds.

The deep-link plugin registers separate environment schemes. The single-instance plugin forwards Windows protocol launches to the running shell; macOS delivers open-URL events. These plugins receive no JavaScript permissions. Cancellation and exchange failure return to the existing translated authentication failure screen. Email-code sign-in remains on the ordinary BFF path.

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

Vitest validates the merged environment and platform configurations against the installed Tauri schema, including storage, privilege constraints, callback registration and attachment of the native handlers. Web Vitest exercises browser PKCE, server-side handoff, native exchange, cookie attributes and rejected states through the actual route handlers. Rust tests inspect the generated native context and cover native proof generation, callback matching, replay, superseded attempts, cancellation, expiry, cookie policies, accepted external links and opener failure without launching a browser. These tests do not prove operating-system protocol delivery or installed-webview behavior. Google and email-code sign-in, persistent sessions, habit logging and Astra streaming still require installed-app acceptance on macOS and Windows.

## Remaining desktop work

Tracks #1560. Broader desktop lifecycle, background notifications, signed updates, web release integration, signed and notarized DMGs and landing downloads, performance comparison, installed-app recording and screen-reader acceptance belong to subsequent steps. This shell exposes no native commands or JavaScript capabilities.
