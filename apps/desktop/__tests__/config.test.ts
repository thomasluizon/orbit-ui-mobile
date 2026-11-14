import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { Ajv } from 'ajv'
import { describe, expect, it } from 'vitest'
import { BUTTON_SIZES, SMALL_PILL_VISIBLE_MIN } from '@orbit/shared/theme'
import base from '../src-tauri/tauri.conf.json'
import production from '../src-tauri/tauri.production.conf.json'
import macos from '../src-tauri/tauri.macos.conf.json'
import windows from '../src-tauri/tauri.windows.conf.json'
import vector from '../__fixtures__/signer-vector.json'
import { releaseConfig } from '../scripts/release.ts'

const require = createRequire(import.meta.url)
const schema = JSON.parse(readFileSync(require.resolve('@tauri-apps/cli/config.schema.json'), 'utf8')) as object
const validate = new Ajv({ strict: false, validateFormats: false, unicodeRegExp: false }).compile(schema)

function mergeConfig(original: object, patch: object): Record<string, unknown> {
  const merged: Record<string, unknown> = structuredClone(original) as Record<string, unknown>
  for (const [key, value] of Object.entries(patch) as [string, unknown][]) {
    if (value === null) delete merged[key]
    else if (typeof value === 'object' && !Array.isArray(value)) {
      const previous = merged[key]
      merged[key] = mergeConfig(typeof previous === 'object' && previous !== null && !Array.isArray(previous) ? previous : {}, value)
    } else merged[key] = value
  }
  return merged
}

const environments = [
  { name: 'staging', config: base, origin: 'https://app-staging.useorbit.org', identifier: 'org.useorbit.desktop.staging' },
  {
    name: 'production',
    config: mergeConfig(base, production) as typeof base,
    origin: 'https://app.useorbit.org',
    identifier: 'org.useorbit.desktop',
  },
]

describe.each(environments)('$name desktop', ({ config, origin, identifier }) => {
  it.each([{ name: 'macOS', platform: macos }, { name: 'Windows', platform: windows }])(
    'validates the merged $name configuration against the installed Tauri schema',
    ({ platform }) => {
      const merged = { ...config, bundle: { ...config.bundle, ...platform.bundle } }
      expect(validate(merged), JSON.stringify(validate.errors)).toBe(true)
    },
  )

  it('loads the deployed UI and keeps auth, mutations and streaming on the BFF origin', () => {
    expect(config).not.toHaveProperty('build.frontendDist')
    expect(config.app.windows).toHaveLength(1)
    const window = config.app.windows[0]!
    expect(window.url).toBe(origin)
    expect(config.identifier).toBe(identifier)
    expect(window.incognito).toBe(false)
  })

  it('creates the window in Rust with the system browser handler attached', () => {
    expect(config.app.windows[0]).toHaveProperty('create', false)
    const entrypoint = readFileSync(new URL('../src-tauri/src/main.rs', import.meta.url), 'utf8').split('#[cfg(test)]')[0]!
    expect(entrypoint).toContain('.setup(setup)')
    expect(entrypoint).toMatch(/fn construct_window[\s\S]*WebviewWindowBuilder::from_config[\s\S]*\.on_new_window\([\s\S]*open_new_window\([\s\S]*tauri_plugin_opener::open_url[\s\S]*\.build\(\)/)
    expect(entrypoint).toContain('.on_navigation(')
    expect(entrypoint).toMatch(/\.invoke_handler\(tauri::generate_handler!\[\s*desktop_login::commit_desktop_login,\s*push::desktop_push,\s*updates::desktop_update,\s*launch::desktop_launch,\s*window_bar::desktop_window,\s*#\[cfg\(feature = "bench-loopback"\)\]\s*bench_viewport::fit_bench_viewport\s*\]\)/)
  })

  it('grants only session completion to its own origin and registers its callback scheme', () => {
    expect(config.app.withGlobalTauri).toBe(false)
    expect(config.app.security.capabilities).toEqual([{
      identifier: 'desktop-auth', local: false, remote: { urls: [`${origin}/*`] },
      windows: ['main'], permissions: ['allow-commit-desktop-login', 'allow-desktop-push', 'allow-desktop-update', 'allow-desktop-launch', 'allow-desktop-window'],
    }])
    expect(config.plugins['deep-link']).toEqual({ desktop: { schemes: [identifier] } })
    expect(existsSync(new URL('../src-tauri/capabilities', import.meta.url))).toBe(false)
  })

  it('pins signed updates to its own public channel without granting updater or notification IPC', () => {
    const channel = identifier.endsWith('.staging') ? 'staging' : 'production'
    expect(config.plugins.updater).toEqual({
      endpoints: [`https://github.com/thomasluizon/orbit-ui-mobile/releases/download/desktop-${channel}/latest.json`],
      pubkey: '',
      requireSignedVersion: true,
      windows: { installMode: 'passive' },
    })
    expect(config.bundle.createUpdaterArtifacts).toBe(true)
  })

  it('keeps lifecycle operations native without granting plugin commands to the deployed page', () => {
    const entrypoint = readFileSync(new URL('../src-tauri/src/main.rs', import.meta.url), 'utf8').split('#[cfg(test)]')[0]!
    expect(entrypoint).toContain('.on_menu_event(menus::handle)')
    expect(entrypoint).toContain('.on_window_event(lifecycle::on_window_event)')
    expect(entrypoint.indexOf('tauri_plugin_single_instance::init')).toBeLessThan(entrypoint.indexOf('tauri_plugin_deep_link::init'))
    const permissions = config.app.security.capabilities.flatMap((capability) => capability.permissions)
    expect(permissions).toEqual(['allow-commit-desktop-login', 'allow-desktop-push', 'allow-desktop-update', 'allow-desktop-launch', 'allow-desktop-window'])
  })

  it('signs macOS with the hardened runtime and the Developer ID push entitlements of its own provisioning profile', () => {
    const macOS = (config.bundle as { macOS?: { entitlements?: string; hardenedRuntime?: boolean } }).macOS
    expect(macOS?.hardenedRuntime).toBe(true)
    const source = readFileSync(new URL(`../src-tauri/${macOS?.entitlements}`, import.meta.url), 'utf8')
    const entries = Object.fromEntries([...source.matchAll(/<key>([^<]+)<\/key><string>([^<]+)<\/string>/g)].map((match) => [match[1]!, match[2]!]))
    expect(entries).toEqual({
      'com.apple.application-identifier': `BD7JH468F7.${identifier}`,
      'com.apple.developer.aps-environment': 'production',
      'com.apple.developer.team-identifier': 'BD7JH468F7',
    })
    expect(source.match(/<key>/g)).toHaveLength(3)
  })

  it('observes native launch intent before startup, gates window creation with it and restores the window on every secondary launch', () => {
    const entrypoint = readFileSync(new URL('../src-tauri/src/main.rs', import.meta.url), 'utf8').split('#[cfg(test)]')[0]!
    expect(entrypoint).toMatch(/\.build\(context\)[\s\S]*if let Err\(error\) = push::prepare_launch\(\)[\s\S]*Cannot observe desktop launch[\s\S]*app\.run\(handle_run_event\)/)
    expect(entrypoint).toMatch(/lifecycle::create_main\(\s*window_config,\s*push::notification_launch\(\)/)
    expect(entrypoint).toContain('.activate_ignoring_other_apps(false)')
    expect(entrypoint).toMatch(/tauri_plugin_single_instance::init\(\|app, arguments, _\| \{\s*push::secondary_launch\(&arguments\);\s*if let Err\(error\) = lifecycle::show_main\(app\)/)
  })
})

describe.each(environments)('$name release', ({ name, origin }) => {
  it.each([{ name: 'macOS', platform: macos }, { name: 'Windows', platform: windows }])(
    'preserves remote command grants through the $name platform, channel and signing overlays',
    ({ platform }) => {
      let merged = mergeConfig(base, platform)
      if (name === 'production') merged = mergeConfig(merged, production)
      merged = mergeConfig(merged, releaseConfig(name, vector.version, vector.publicKey))
      expect(validate(merged), JSON.stringify(validate.errors)).toBe(true)
      const config = merged as typeof base
      expect(config).not.toHaveProperty('build.frontendDist')
      expect(config.app.windows[0]!.url).toBe(origin)
      expect(config.plugins.updater.pubkey).toBe(vector.publicKey)
      const commands = [
        '../../web/components/auth/desktop-auth-bridge.tsx',
        '../../web/lib/desktop-push.ts',
        '../../web/lib/desktop-updates.ts',
      ].flatMap((path) => [...readFileSync(new URL(path, import.meta.url), 'utf8')
        .matchAll(/\binvoke\('((?:desktop_|commit_desktop_)[^']+)'/g)].map((match) => match[1]!))
      expect(commands).toEqual(['commit_desktop_login', 'desktop_push', 'desktop_update'])
      const capability = config.app.security.capabilities[0]!
      expect(capability.local).toBe(false)
      expect(capability.remote.urls).toEqual([`${origin}/*`])
      expect(capability.windows).toEqual(['main'])
      expect(capability.permissions).toEqual([...commands.map((command) => `allow-${command.replaceAll('_', '-')}`), 'allow-desktop-launch', 'allow-desktop-window'])
    },
  )
})

it('draws no native window frame on Windows and hands the frame to the Orbit bar', () => {
  const frame = readFileSync(new URL('../src-tauri/src/window_bar.rs', import.meta.url), 'utf8').split('#[cfg(test)]')[0]!
  expect(frame).toMatch(/Platform::Windows => \{\s*config\.decorations = false;[\s\S]*config\.shadow = false;/)
  const lifecycle = readFileSync(new URL('../src-tauri/src/lifecycle.rs', import.meta.url), 'utf8').split('#[cfg(test)]')[0]!
  expect(lifecycle).toContain('crate::window_bar::configure_frame(&mut config, crate::window_bar::Platform::current());')
  for (const config of [base, production, windows]) expect(JSON.stringify(config)).not.toContain('"decorations"')
})

it('keeps the native snap region, the page bar and the stylesheet on one geometry and one command', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
  const page = read('../../web/lib/desktop-window.ts')
  const constant = (source: string, pattern: RegExp) => Number(source.match(pattern)?.[1])
  const native = read('../src-tauri/native/windows/caption.cpp')
  const height = constant(page, /DESKTOP_WINDOW_BAR_HEIGHT = (\d+)/)
  const inset = constant(page, /DESKTOP_WINDOW_BAR_END_INSET = (\d+)/)
  const control = Math.max(SMALL_PILL_VISIBLE_MIN, BUTTON_SIZES.sm.height)
  expect(page).toContain('export const DESKTOP_WINDOW_CONTROL_WIDTH = Math.max(SMALL_PILL_VISIBLE_MIN, BUTTON_SIZES.sm.height)')
  for (const [nativeName, value] of [['kBarHeight', height], ['kControlWidth', control], ['kEndInset', inset]] as const) {
    expect(value).toBeGreaterThan(0)
    expect(constant(native, new RegExp(`${nativeName} = (\\d+)`))).toBe(value)
  }
  const menuAnchor = read('../src-tauri/src/window_bar.rs')
  expect(menuAnchor).toContain(`const BAR_HEIGHT: f64 = ${height}.0;`)
  expect(menuAnchor).toContain(`const BAR_END_INSET: f64 = ${inset}.0;`)
  expect(menuAnchor).toContain('tauri::LogicalPosition::new(BAR_END_INSET, BAR_HEIGHT)')
  const acceptanceReader = read('../../../tools/desktop-bench/acceptance-window-bar.cs')
  for (const [name, value] of [['BarCssHeight', height], ['ControlCssWidth', control], ['EndCssInset', inset]] as const) {
    expect(acceptanceReader).toContain(`private const int ${name} = ${value};`)
  }
  expect(read('../src-tauri/native/windows/caption.cpp')).toMatch(/CreateWindowExW\(WS_EX_LAYERED,[\s\S]*SetLayeredWindowAttributes\(caption\.overlay, 0, kRegionAlpha, LWA_ALPHA\)/)
  expect(read('../src-tauri/native/windows/caption.cpp')).toContain('static constexpr BYTE kRegionAlpha = 1;')
  expect(read('../../web/app/globals.css')).toContain(`--desktop-window-bar-height: ${height}px;`)
  expect(page).toContain("runtime.invoke('desktop_window', { action })")
  expect(read('../src-tauri/src/window_bar.rs')).toContain(`'${page.match(/DESKTOP_MAXIMIZE_HOVER_EVENT = '([^']+)'/)?.[1]}'`)
  expect(read('../src-tauri/build.rs')).toContain('.file("native/windows/caption.cpp")')
  expect(read('../src-tauri/native/windows/launch.cpp')).not.toMatch(/DWMWA_CAPTION_COLOR|dwmapi/)
})

it('gives the native frame back to a document without the bar, and answers in the snap region only under a drawn bar', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
  const entrypoint = read('../src-tauri/src/main.rs')
  expect(entrypoint).toContain('app.manage(window_bar::FrameState::default());')
  expect(entrypoint).toMatch(/\.on_page_load\(\|window, payload\| \{[^}]*window_bar::page_loading\(&window, payload\.event\(\)\);/)
  expect(entrypoint).toMatch(/\.build\(\)\?;[\s\S]*window_bar::window_created\(&window\);\s*drop\(window\);/)
  expect(entrypoint).toMatch(/#\[cfg\(target_os = "macos"\)\]\s*let builder = builder[^;]*\.on_web_content_process_terminate\(window_bar::content_process_ended\);/)
  const frame = read('../src-tauri/src/window_bar.rs').split('#[cfg(test)]')[0]!
  expect(frame).toMatch(/pub fn content_process_ended\(webview: &tauri::Webview\) \{[\s\S]*page_loading\(&window, tauri::webview::PageLoadEvent::Started\);[\s\S]*webview\.reload\(\)/)
  const caption = read('../src-tauri/native/windows/caption.cpp')
  expect(caption).toContain('CreateWindowExW(WS_EX_LAYERED, definition.lpszClassName, L"", WS_CHILD | WS_CLIPSIBLINGS,')
  expect(caption).toContain('extern "C" void orbit_caption_set_active(void *parent, bool active)')
  expect(read('../src-tauri/src/window_bar.rs')).toContain('fn orbit_caption_set_active(window: *mut std::ffi::c_void, active: bool);')
  expect(read('../../web/lib/desktop-window.ts')).toContain("invoke('desktop_window', { action: 'bar', drawn })")
})

it('embeds a Windows manifest that keeps Common Controls 6 and declares Windows 8 and later for the layered snap region', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
  const build = read('../src-tauri/build.rs')
  expect(build).toMatch(/\.windows_attributes\(\s*tauri_build::WindowsAttributes::new\(\)\s*\.app_manifest\(include_str!\("windows-app-manifest\.xml"\)\),?\s*\)/)
  expect(build).toContain('cargo:rerun-if-changed=windows-app-manifest.xml')
  const manifest = read('../src-tauri/windows-app-manifest.xml')
  expect(manifest).toContain('name="Microsoft.Windows.Common-Controls"')
  expect(manifest).toContain('version="6.0.0.0"')
  for (const id of ['8e0f7a12-bfb3-4fe8-b9a5-48fd50a15a9a', '1f676c76-80e1-4239-95bb-83d0f6d0da78', '4a2f28e3-53b9-4441-ba9c-d69d4a4a6e38']) {
    expect(manifest).toContain(`<supportedOS Id="{${id}}"/>`)
  }
})

it('gives staging and production separate persistent webview identities', () => {
  expect(base.identifier).not.toBe(production.identifier)
})

it('keeps updater archive parsing above the GHSA-m665-v7pm-7grj affected versions', () => {
  const lockfile = readFileSync(new URL('../src-tauri/Cargo.lock', import.meta.url), 'utf8')
  const versions = [...lockfile.matchAll(/^name = "zip"\r?\nversion = "(\d+)\.(\d+)\.(\d+)"\r?$/gm)]
  expect(versions.length).toBeGreaterThan(0)
  for (const [entry, major, minor, patch] of versions) {
    const patched = Number(major) > 9
      || (Number(major) === 9 && (Number(minor) > 0 || Number(patch) >= 5))
    expect(patched, entry).toBe(true)
  }
})

it('keeps exactly the web CSP frame-src origins inside the desktop webview', () => {
  const policy = readFileSync(new URL('../../web/proxy.ts', import.meta.url), 'utf8')
  const directives = [...policy.matchAll(/["'`]frame-src ([^"'`]+)["'`]/g)].map((match) => match[1]!)
  expect(directives).toHaveLength(1)
  const cspOrigins = directives[0]!.trim().split(/\s+/).map((source) => new URL(source).origin)
  const entrypoint = readFileSync(new URL('../src-tauri/src/main.rs', import.meta.url), 'utf8').split('#[cfg(test)]')[0]!
  expect(entrypoint).toMatch(/fn is_embedded_frame\(url: &tauri::Url\) -> bool \{\s*EMBEDDED_FRAME_DOCUMENTS\.contains\(&url\.as_str\(\)\)\s*\|\| EMBEDDED_FRAME_ORIGINS\.contains\(&url\.origin\(\)\.ascii_serialization\(\)\.as_str\(\)\)\s*\}/)
  const allowlist = entrypoint.match(/const EMBEDDED_FRAME_ORIGINS: \[&str; \d+\] = \[([^\]]*)\];/)?.[1]
  expect(allowlist).toBeDefined()
  const desktopOrigins = [...allowlist!.matchAll(/"([^"]+)"/g)].map((match) => match[1]!)
  expect(cspOrigins.filter((origin) => !desktopOrigins.includes(origin))).toEqual([])
  expect(desktopOrigins.filter((origin) => !cspOrigins.includes(origin))).toEqual([])
})

it('keeps exactly the Turnstile challenge documents the iOS app loads in subframes', () => {
  const ios = readFileSync(new URL('../../mobile/lib/turnstile-frames.ts', import.meta.url), 'utf8')
  const iosDocuments = ios.match(/const CHALLENGE_DOCUMENTS = new Set\(\[([^\]]*)\]\)/)?.[1]
  expect(iosDocuments).toBeDefined()
  const entrypoint = readFileSync(new URL('../src-tauri/src/main.rs', import.meta.url), 'utf8').split('#[cfg(test)]')[0]!
  const desktopDocuments = entrypoint.match(/const EMBEDDED_FRAME_DOCUMENTS: \[&str; \d+\] = \[([^\]]*)\];/)?.[1]
  expect(desktopDocuments).toBeDefined()
  const quoted = (list: string) => [...list.matchAll(/["']([^"']+)["']/g)].map((match) => match[1]!).sort((left, right) => left.localeCompare(right))
  expect(quoted(desktopDocuments!)).toEqual(quoted(iosDocuments!))
  expect(quoted(desktopDocuments!)).toEqual(['about:blank', 'about:srcdoc'])
})
