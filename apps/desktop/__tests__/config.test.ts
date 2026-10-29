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
    expect(entrypoint).toMatch(/\.setup\([\s\S]*WebviewWindowBuilder::from_config[\s\S]*\.on_new_window\([\s\S]*open_new_window\([\s\S]*tauri_plugin_opener::open_url[\s\S]*\.build\(\)/)
    expect(entrypoint).toContain('.on_navigation(')
    expect(entrypoint).toMatch(/\.invoke_handler\(tauri::generate_handler!\[\s*desktop_login::commit_desktop_login,\s*push::desktop_push,\s*updates::desktop_update\s*\]\)/)
  })

  it('grants only session completion to its own origin and registers its callback scheme', () => {
    expect(config.app.withGlobalTauri).toBe(false)
    expect(config.app.security.capabilities).toEqual([{
      identifier: 'desktop-auth', local: false, remote: { urls: [`${origin}/*`] },
      windows: ['main'], permissions: ['allow-commit-desktop-login', 'allow-desktop-push', 'allow-desktop-update'],
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
    expect(permissions).toEqual(['allow-commit-desktop-login', 'allow-desktop-push', 'allow-desktop-update'])
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
      expect(capability.permissions).toEqual(commands.map((command) => `allow-${command.replaceAll('_', '-')}`))
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
