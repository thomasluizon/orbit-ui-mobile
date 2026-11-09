import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { Ajv } from 'ajv'
import { describe, expect, it } from 'vitest'
import base from '../src-tauri/tauri.conf.json'
import production from '../src-tauri/tauri.production.conf.json'
import macos from '../src-tauri/tauri.macos.conf.json'
import windows from '../src-tauri/tauri.windows.conf.json'
import vector from '../__fixtures__/signer-vector.json'
import { releaseConfig } from '../scripts/release.ts'

const require = createRequire(import.meta.url)
const schema: object = JSON.parse(readFileSync(require.resolve('@tauri-apps/cli/config.schema.json'), 'utf8'))
const validate = new Ajv({ strict: false, validateFormats: false, unicodeRegExp: false }).compile(schema)

function mergeConfig(original: object, patch: object): Record<string, unknown> {
  const merged: Record<string, unknown> = structuredClone(original) as Record<string, unknown>
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete merged[key]
    else if (typeof value === 'object' && !Array.isArray(value)) {
      const previous = merged[key]
      merged[key] = mergeConfig(previous && typeof previous === 'object' && !Array.isArray(previous) ? previous : {}, value)
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
    expect(entrypoint).toMatch(/\.invoke_handler\(tauri::generate_handler!\[\s*desktop_login::commit_desktop_login,\s*push::desktop_push,\s*updates::desktop_update,\s*launch::desktop_launch,\s*#\[cfg\(feature = "bench-loopback"\)\]\s*bench_viewport::fit_bench_viewport\s*\]\)/)
  })

  it('grants only session completion to its own origin and registers its callback scheme', () => {
    expect(config.app.withGlobalTauri).toBe(false)
    expect(config.app.security.capabilities).toEqual([{
      identifier: 'desktop-auth', local: false, remote: { urls: [`${origin}/*`] },
      windows: ['main'], permissions: ['allow-commit-desktop-login', 'allow-desktop-push', 'allow-desktop-update', 'allow-desktop-launch'],
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
    expect(permissions).toEqual(['allow-commit-desktop-login', 'allow-desktop-push', 'allow-desktop-update', 'allow-desktop-launch'])
  })

  it('signs macOS with the hardened runtime and the Developer ID push entitlements of its own provisioning profile', () => {
    const macOS = (config.bundle as { macOS?: { entitlements?: string; hardenedRuntime?: boolean } }).macOS
    expect(macOS?.hardenedRuntime).toBe(true)
    const source = readFileSync(new URL(`../src-tauri/${macOS?.entitlements}`, import.meta.url), 'utf8')
    const entries = Object.fromEntries([...source.matchAll(/<key>([^<]+)<\/key><string>([^<]+)<\/string>/g)].map((match) => [match[1], match[2]]))
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
      expect(capability.permissions).toEqual([...commands.map((command) => `allow-${command.replaceAll('_', '-')}`), 'allow-desktop-launch'])
    },
  )
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
  const quoted = (list: string) => [...list.matchAll(/["']([^"']+)["']/g)].map((match) => match[1]!).sort()
  expect(quoted(desktopDocuments!)).toEqual(quoted(iosDocuments!))
  expect(quoted(desktopDocuments!)).toEqual(['about:blank', 'about:srcdoc'])
})
