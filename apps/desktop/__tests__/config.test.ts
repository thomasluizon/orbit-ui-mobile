import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { Ajv } from 'ajv'
import { describe, expect, it } from 'vitest'
import base from '../src-tauri/tauri.conf.json'
import production from '../src-tauri/tauri.production.conf.json'
import macos from '../src-tauri/tauri.macos.conf.json'
import windows from '../src-tauri/tauri.windows.conf.json'

const require = createRequire(import.meta.url)
const schema: object = JSON.parse(readFileSync(require.resolve('@tauri-apps/cli/config.schema.json'), 'utf8'))
const validate = new Ajv({ strict: false, validateFormats: false, unicodeRegExp: false }).compile(schema)

const environments = [
  { name: 'staging', config: base, origin: 'https://app-staging.useorbit.org', identifier: 'org.useorbit.desktop.staging' },
  {
    name: 'production',
    config: { ...base, ...production, app: { ...base.app, ...production.app } },
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
    expect(config.build).toEqual({ frontendDist: origin })
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
    expect(entrypoint).toMatch(/\.invoke_handler\(tauri::generate_handler!\[\s*desktop_login::commit_desktop_login,\s*push::desktop_push\s*\]\)/)
  })

  it('grants only session completion to its own origin and registers its callback scheme', () => {
    expect(config.app.withGlobalTauri).toBe(false)
    expect(config.app.security.capabilities).toEqual([{
      identifier: 'desktop-auth', local: false, remote: { urls: [`${origin}/*`] },
      windows: ['main'], permissions: ['allow-commit-desktop-login', 'allow-desktop-push'],
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
    expect(permissions).toEqual(['allow-commit-desktop-login', 'allow-desktop-push'])
  })
})

it('gives staging and production separate persistent webview identities', () => {
  expect(base.identifier).not.toBe(production.identifier)
})
