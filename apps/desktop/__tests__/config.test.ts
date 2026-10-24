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

  it('exposes no native commands, plugins or capability files', () => {
    expect(config.app.withGlobalTauri).toBe(false)
    expect(config.app.security.capabilities).toEqual([])
    expect(config).not.toHaveProperty('plugins')
    expect(existsSync(new URL('../src-tauri/capabilities', import.meta.url))).toBe(false)
  })
})

it('gives staging and production separate persistent webview identities', () => {
  expect(base.identifier).not.toBe(production.identifier)
})
