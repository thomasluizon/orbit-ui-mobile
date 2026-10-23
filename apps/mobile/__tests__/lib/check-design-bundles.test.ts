import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { checkDesignBundles } = require('../../scripts/check-design-bundles.js') as {
  checkDesignBundles: (root: string) => string
}
const root = resolve(import.meta.dirname, '../../../..')
const script = resolve(root, 'apps/mobile/scripts/check-design-bundles.js')
let fixture: string

beforeEach(() => {
  fixture = mkdtempSync(resolve(tmpdir(), 'orbit-embedded-bundle-'))
  mkdirSync(resolve(fixture, 'apps/mobile'), { recursive: true })
})
afterEach(() => { rmSync(fixture, { recursive: true, force: true }) })

describe('embedded Android bundle check', () => {
  it.each(['production', 'staging'])('accepts the shipping %s config', (variant) => {
    expect(execFileSync(process.execPath, [script, root], {
      encoding: 'utf8', env: { ...process.env, ORBIT_APP_VARIANT: variant },
    })).toContain('embedded bundle is ready')
  })

  it('rejects updates being enabled', () => {
    writeFileSync(resolve(fixture, 'apps/mobile/app.config.js'), 'module.exports = () => ({ updates: { enabled: true } })')
    expect(() => checkDesignBundles(fixture)).toThrow('must disable updates')
    const result = spawnSync(process.execPath, [script, fixture], { encoding: 'utf8' })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('must disable updates')
  })

  it('rejects a missing source tree', () => {
    const result = spawnSync(process.execPath, [script], { encoding: 'utf8' })
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('Usage:')
  })
})
