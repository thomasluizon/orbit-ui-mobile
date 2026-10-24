# Orbit desktop

A Tauri 2 webview loads the deployed Orbit app directly. Staging opens `https://app-staging.useorbit.org`; production opens `https://app.useorbit.org`. There is no bundled copy of the UI or local server. Requests, Server Actions and Astra streaming stay on the web app's BFF, using its secure httpOnly cookies. A persistent webview retains sign-in between launches. Separate application identifiers isolate staging and production storage.

Links requesting a new window, including invoice downloads, open HTTP and HTTPS destinations in the system browser on both platforms. Rust attaches the handler before creating the configured window. Other schemes cannot launch local files or protocol handlers. The pinned opener crate supplies only its Rust function; its plugin is never registered, so it adds no JavaScript bridge or injected script. No IPC capabilities are granted.

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
```

Vitest validates the merged environment and platform configurations against the installed Tauri schema, including storage, privilege constraints and attachment of the native new-window handler. Its workspace coverage job publishes configuration LCOV alongside the other workspaces. Rust tests inspect the generated native context and exercise accepted links, rejected schemes and system opener failure without launching a browser. Neither proves installed-webview behavior. Email-code sign-in, persistent sessions, habit logging, Astra streaming and system browser handoff still require installed-app acceptance on macOS and Windows.

## Remaining desktop work

Tracks #1560. Google sign-in handoff and keychain integration, desktop lifecycle and deep links, background notifications, signed updates, web release integration, signed and notarized DMGs and landing downloads, performance comparison, installed-app recording and screen-reader acceptance belong to subsequent steps. This shell exposes no native commands or registered plugins.
