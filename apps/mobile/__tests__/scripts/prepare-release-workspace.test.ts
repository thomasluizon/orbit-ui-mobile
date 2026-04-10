import path from 'path'
import { describe, expect, it } from 'vitest'

const {
  mobileIgnoredNames,
  shouldIgnore,
} = require('../../scripts/prepare-release-workspace.js') as {
  mobileIgnoredNames: Set<string>
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
})
