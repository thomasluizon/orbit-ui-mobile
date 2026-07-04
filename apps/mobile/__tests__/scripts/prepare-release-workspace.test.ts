import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterAll, describe, expect, it } from 'vitest'

const {
  mobileIgnoredNames,
  prepareReleaseWorkspace,
  shouldIgnore,
} = require('../../scripts/prepare-release-workspace.js') as {
  mobileIgnoredNames: Set<string>
  prepareReleaseWorkspace: (targetRoot: string) => void
  shouldIgnore: (sourcePath: string, ignoredNames: Set<string>, sourceRoot: string) => boolean
}

describe('prepare release workspace', () => {
  const mobileRoot = path.resolve(__dirname, '../..')

  it('ignores only the app-level android project', () => {
    expect(shouldIgnore(path.join(mobileRoot, 'android'), mobileIgnoredNames, mobileRoot)).toBe(true)
    expect(
      shouldIgnore(path.join(mobileRoot, 'modules', 'orbit-widget', 'android'), mobileIgnoredNames, mobileRoot),
    ).toBe(false)
  })

  it('still ignores generated widget build outputs', () => {
    expect(
      shouldIgnore(
        path.join(mobileRoot, 'modules', 'orbit-widget', 'android', 'build', 'intermediates'),
        mobileIgnoredNames,
        mobileRoot,
      ),
    ).toBe(true)
  })

  describe('prepared workspace tsconfig', () => {
    const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-release-ws-'))

    afterAll(() => {
      fs.rmSync(targetRoot, { recursive: true, force: true })
    })

    it('keeps the tsconfig extends chain inside the mobile project root', () => {
      prepareReleaseWorkspace(targetRoot)

      const mobileDir = path.join(targetRoot, 'apps', 'mobile')
      const tsconfig = JSON.parse(
        fs.readFileSync(path.join(mobileDir, 'tsconfig.json'), 'utf8'),
      ) as { extends?: string }

      expect(tsconfig.extends).toBe('./tsconfig.base.json')
      expect(fs.existsSync(path.join(mobileDir, 'tsconfig.base.json'))).toBe(true)
      expect(fs.existsSync(path.join(targetRoot, 'tsconfig.base.json'))).toBe(true)
    })
  })
})
