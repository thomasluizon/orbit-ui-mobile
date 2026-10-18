import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { checkDesignBundles } = require('../../scripts/check-design-bundles.js') as {
  checkDesignBundles: (legacyRoot: string, redesignRoot: string) => void
}
const root = resolve(import.meta.dirname, '../../../..')
let fixture: string
let legacy: string
let redesign: string

beforeEach(() => {
  fixture = mkdtempSync(resolve(tmpdir(), 'orbit-design-bundles-'))
  legacy = resolve(fixture, 'legacy')
  redesign = resolve(fixture, 'redesign')
  for (const destination of [legacy, redesign]) {
    mkdirSync(resolve(destination, 'apps/mobile/lib'), { recursive: true })
    for (const path of [
      'package-lock.json', 'apps/mobile/app.json', 'apps/mobile/app.config.js',
      'apps/mobile/modules', 'apps/mobile/plugins', 'apps/mobile/lib/design-bundle.ts',
      'apps/mobile/lib/design-flag-refresh.ts', 'apps/mobile/lib/providers.tsx',
      'apps/mobile/lib/design-bundle-identity.ts',
    ]) cpSync(resolve(root, path), resolve(destination, path), { recursive: true })
    symlinkSync(resolve(root, 'node_modules'), resolve(destination, 'node_modules'), 'junction')
  }
  const identity = resolve(redesign, 'apps/mobile/lib/design-bundle-identity.ts')
  writeFileSync(identity, readFileSync(identity, 'utf8').replace("= 'legacy'", "= 'redesign'"))
})
afterEach(() => { rmSync(fixture, { recursive: true }) })

describe('Android design publication guard', () => {
  it('accepts two real source trees carrying the union with different bundle identities', () => {
    expect(() => checkDesignBundles(legacy, redesign)).not.toThrow()
  })

  it('rejects a redesign native dependency absent from the union version', () => {
    const path = resolve(redesign, 'package-lock.json')
    const lock = JSON.parse(readFileSync(path, 'utf8')) as { packages: Record<string, { version: string }> }
    lock.packages['node_modules/react-native-share']!.version = '12.3.2'
    writeFileSync(path, JSON.stringify(lock))
    expect(() => checkDesignBundles(legacy, redesign)).toThrow('Native version mismatch')
  })

  it('rejects the old widget bridge before either bundle can publish', () => {
    writeFileSync(resolve(redesign, 'apps/mobile/modules/orbit-widget/android/src/main/java/org/useorbit/app/widget/OrbitWidgetModule.kt'), '')
    expect(() => checkDesignBundles(legacy, redesign)).toThrow('OrbitWidgetModule.kt')
  })

  it('rejects a missing redesign switch-back adapter', () => {
    rmSync(resolve(redesign, 'apps/mobile/lib/design-bundle.ts'))
    expect(() => checkDesignBundles(legacy, redesign)).toThrow('design-bundle.ts')
  })

  it('rejects a different runtime even when the native bridges match', () => {
    const path = resolve(redesign, 'apps/mobile/app.json')
    writeFileSync(path, readFileSync(path, 'utf8').replace('orbit-android-designs-1', 'orbit-android-designs-2'))
    expect(() => checkDesignBundles(legacy, redesign)).toThrow('same fixed runtimeVersion')
  })
})
