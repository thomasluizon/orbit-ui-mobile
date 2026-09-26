import { spawnSync } from 'node:child_process'
import { fileURLToPath, URL } from 'node:url'
import { describe, expect, it } from 'vitest'

const releaseScript = fileURLToPath(new URL('../../scripts/android-release-apk.js', import.meta.url))

describe('Android release script arguments', () => {
  it('exits successfully for help', () => {
    const result = spawnSync(process.execPath, [releaseScript, '--help'], { encoding: 'utf8' })

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('android-release-apk.js')
  })

  it('rejects an unknown argument before starting a build', () => {
    const result = spawnSync(process.execPath, [releaseScript, '--invalid'], { encoding: 'utf8' })

    expect(result.status).toBe(2)
    expect(result.stderr).toContain('unknown argument: --invalid')
  })
})
