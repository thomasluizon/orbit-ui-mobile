# apps/desktop

Tauri 2 shell for macOS and Windows. The webview loads the deployed web app. This workspace owns no screens, web build or API client. Root conventions apply.

- Keep the Rust entry point minimal. Do not add native commands or plugins without their carrying ticket and origin-scoped capabilities.
- Staging is the default build. Production uses `src-tauri/tauri.production.conf.json`. Keep identifiers and webview storage separate.
- Email sign-in, habit logging and Orbit use the web origin's existing BFF and httpOnly cookies. The native Google handoff transfers BFF cookie headers directly into the webview cookie store. Never persist tokens in native storage, JavaScript storage or configuration, or expose them to page JavaScript.
- Keep Tauri crates and the npm CLI pinned exactly. Confirm configuration and CLI interfaces against the installed sources before you change them.
- Keep single-instance first in plugin registration, so secondary launches forward links before they restore the existing window. macOS Dock reopen, tray Open and accepted deep links share the same show, unminimize and focus path.
- Closing the main window hides it and keeps its webview alive. Quit saves geometry and exits. Never persist window visibility, because it could hide the next launch.
- Native menus follow the system locale at launch. Keep every label in both `locales/en.json` and `locales/pt-BR.json`.
- Launch at login is an opt-in menu setting. Never enable it during setup.
- Lifecycle, updater, dialog and local notification plugins receive no JavaScript permissions. App deep links accept only known routes without queries or fragments.
- Native reminders need the signed bundle's APNs entitlement or the WNS service principal Object ID. Missing configuration stays inert. Revoke confirmed and uncertain endpoints before you clear the BFF session.
- The update flow lives in `src-tauri`. Update endpoints and signing keys belong to the environment. Require TLS and version-bound signatures. Never allow downgrades.
- Read release assets in scripts through `scripts/release-asset.ts`, never through `releases/download`. Only the installed shell's update endpoint stays on that path.
- Never define `_ALLOW_COMPILER_AND_STL_VERSION_MISMATCH`. Never skip the C++ native tests on Windows. They compile with `resolveCppCompiler` and run every compiler and test executable through `runNative`, both from `__tests__/support/cpp-compiler.ts`. `runNative` writes output to a file, because a helper that the linker starts can hold a pipe open after the link and stall `spawnSync`.
- `desktop-build.yml` builds the native packages. `desktop-release.yml` signs and publishes them.
