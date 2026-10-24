import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import appJson from '../../app.json'

describe('native release version synchronization', () => {
  let directory: string
  let script: string
  const readConfig = () => JSON.parse(readFileSync(join(directory, 'app.json'), 'utf8')) as typeof appJson

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'orbit-ios-version-'))
    mkdirSync(join(directory, 'scripts'))
    script = join(directory, 'scripts/set-app-version.js')
    copyFileSync(resolve('scripts/set-app-version.js'), script)
    copyFileSync(resolve('app.json'), join(directory, 'app.json'))
  })

  afterEach(() => rmSync(directory, { recursive: true, force: true }))

  it('preserves the iOS build number when the Android release calls it', () => {
    execFileSync(process.execPath, [script, '2.0.0', '100'])
    expect(readConfig().expo).toMatchObject({ version: '2.0.0', android: { versionCode: 100 }, ios: { buildNumber: appJson.expo.ios.buildNumber } })
  })

  it('sets an iOS build number without changing Android and can repeat the same version', () => {
    for (let attempt = 0; attempt < 2; attempt++) execFileSync(process.execPath, [script, '2.0.0', '', '42'])
    expect(readConfig().expo).toEqual({ ...appJson.expo, version: '2.0.0', ios: { ...appJson.expo.ios, buildNumber: '42' } })
  })

  it.each(['0', '-1', '1suffix', '1.2', '1234567890123456789'])('rejects invalid iOS build number %s without writing', (buildNumber) => {
    expect(() => execFileSync(process.execPath, [script, '2.0.0', '', buildNumber], { stdio: 'pipe' })).toThrow()
    expect(readConfig()).toEqual(appJson)
  })
})
