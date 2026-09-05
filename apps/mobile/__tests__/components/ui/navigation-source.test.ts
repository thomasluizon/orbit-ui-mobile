import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('navigation source contracts', () => {
  it('ships no translations or accent-filled segmented option', () => {
    for (const file of ['ui/app-bar', 'ui/pager', 'ui/segmented-control', 'ui/section-label', 'navigation/bottom-tab-bar']) {
      const source = readFileSync(`components/${file}.tsx`, 'utf8')
      expect(source).not.toMatch(/useTranslations?\s*\(/)
    }
    const segments = readFileSync('components/ui/segmented-control.tsx', 'utf8')
    expect(segments).not.toMatch(/bg-\[var\(--primary\)\]|backgroundColor:\s*tokens\.primary|#C4530F/i)
  })
})
