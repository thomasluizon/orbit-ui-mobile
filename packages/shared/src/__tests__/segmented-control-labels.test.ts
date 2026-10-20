import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'
import { collectSegmentCallSites, segmentTranslation, SEGMENT_GEOMETRY_OWNERS, SEGMENT_ROW_ALLOWLIST } from '../test-support/segmented-control-inventory'

const repositoryRoot = fileURLToPath(new URL('../../../../', import.meta.url))

describe.each(['web', 'mobile'] as const)('SegmentedControl labels on %s', (platform) => {
  const sites = collectSegmentCallSites(repositoryRoot, platform)

  it('requires geometry coverage for every call site', () => {
    const calendar = platform === 'web' ? 'app/(app)/calendar/page.tsx' : 'app/(tabs)/calendar.tsx'
    expect(sites.map((site) => site.path).sort((left, right) => left.localeCompare(right))).toEqual([
      ...SEGMENT_GEOMETRY_OWNERS,
      'components/onboarding/onboarding-create-habit.tsx',
      'components/onboarding/onboarding-create-habit.tsx',
      calendar,
    ].sort((left, right) => left.localeCompare(right)))
    expect(SEGMENT_ROW_ALLOWLIST.every((entry) => entry.reason.length > 0)).toBe(true)
  })

  it.each([{ locale: 'en', messages: en }, { locale: 'pt-BR', messages: ptBR }])('resolves every option to one word in $locale', ({ messages }) => {
    expect(sites.length).toBeGreaterThan(0)
    for (const site of sites) for (const key of site.optionKeys) {
      const label = segmentTranslation(messages, key)
      expect(label.trim().split(/\s+/), `${platform}/${site.path}: ${key} = ${label}`).toHaveLength(1)
      expect(label.trim().length).toBeGreaterThan(0)
    }
  })
})
