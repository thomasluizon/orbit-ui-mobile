# apps/desktop

Tauri 2 shell for macOS and Windows. The webview loads the deployed web app; this workspace owns no screens, web build or API client. Root conventions apply.

- Keep the Rust entry point minimal. Do not add native commands or plugins without their carrying ticket and origin-scoped capabilities.
- Staging is the default build. Production uses `src-tauri/tauri.production.conf.json`; keep identifiers and webview storage separate.
- Email sign-in, habit logging and Astra use the web origin's existing BFF and httpOnly cookies. The native Google handoff transfers BFF cookie headers directly into the webview cookie store. Never persist tokens in native storage, JavaScript storage or configuration, or expose them to page JavaScript.
- Keep Tauri crates and the npm CLI pinned exactly. Confirm configuration and CLI interfaces against the installed sources before changing them.
- Keep single-instance first in plugin registration so secondary launches forward links before restoring the existing window. macOS Dock reopen, tray Open and accepted deep links share the same show, unminimize and focus path.
- Closing the main window hides it and keeps its webview alive. Quit saves geometry and exits. Never persist window visibility, which could hide the next launch.
- Native menus follow the system locale at launch. Keep every label in both `locales/en.json` and `locales/pt-BR.json`. The palette script drives the existing web keyboard hook and must retain its modal focus guard.
- Launch at login is an opt-in native menu setting. Use the official autostart plugin with the environment identifier as its registration name. Never enable it during setup.
- Lifecycle plugins receive no JavaScript permissions. The only remote capability remains session completion on the exact environment origin and main window. App deep links accept only known routes without queries or fragments; auth callbacks retain their separate state and proof checks.
- `npm run test -w @orbit/desktop` validates configuration against the installed CLI schema. `cargo test --locked` in `src-tauri` tests the generated native context without opening a window.
- Native compilation and packaging run in `desktop-build.yml`. The root Turbo build excludes native packaging so web and Android jobs do not require desktop SDKs.
