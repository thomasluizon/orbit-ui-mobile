# apps/desktop

Tauri 2 shell for macOS and Windows. The webview loads the deployed web app; this workspace owns no screens, web build or API client. Root conventions apply.

- Keep the Rust entry point minimal. Do not add native commands or plugins without their carrying ticket and origin-scoped capabilities.
- Staging is the default build. Production uses `src-tauri/tauri.production.conf.json`; keep identifiers and webview storage separate.
- Email sign-in, habit logging and Astra use the web origin's existing BFF and httpOnly cookies. The native Google handoff transfers BFF cookie headers directly into the webview cookie store. Never persist tokens in native storage, JavaScript storage or configuration, or expose them to page JavaScript.
- Keep Tauri crates and the npm CLI pinned exactly. Confirm configuration and CLI interfaces against the installed sources before changing them.
- `npm run test -w @orbit/desktop` validates configuration against the installed CLI schema. `cargo test --locked` in `src-tauri` tests the generated native context without opening a window.
- Native compilation and packaging run in `desktop-build.yml`. The root Turbo build excludes native packaging so web and Android jobs do not require desktop SDKs.
