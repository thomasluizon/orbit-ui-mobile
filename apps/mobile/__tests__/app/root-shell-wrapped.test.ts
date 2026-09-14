import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Wrapped root shell', () => {
  it('routes Wrapped through the chrome-free shell without a composer or destination tab bar', () => {
    const source = readFileSync('app/_layout.tsx', 'utf8')
    const predicateStart = source.indexOf('const hideAppShellChrome =')
    const predicateEnd = source.indexOf('\n\n  const showBottomNav', predicateStart)
    const chromeFreePredicate = source.slice(predicateStart, predicateEnd)
    const chromeFreeSegments = [...chromeFreePredicate.matchAll(/topSegment === '([^']+)'/g)]
      .map((match) => match[1])

    expect(chromeFreeSegments).toContain('wrapped')

    const chromeFreeBranchStart = source.indexOf('nav={false}')
    const chromeFreeBranchEnd = source.indexOf('</Shell412>', chromeFreeBranchStart)
    const chromeFreeBranch = source.slice(chromeFreeBranchStart, chromeFreeBranchEnd)
    expect(chromeFreeBranch).not.toContain('composer=')
    expect(chromeFreeBranch).not.toContain('tabBar=')
  })
})
