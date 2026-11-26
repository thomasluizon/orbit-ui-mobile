import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import { resolveWebThemeVariables } from '@/lib/theme-dom'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const graphicFloor = 3
const graphicSites = [
  'apps/mobile/components/auth/login-sections.tsx',
  'apps/mobile/components/calendar-sync/calendar-sync-event-row.tsx',
  'apps/mobile/components/search/search-results.tsx',
  'apps/mobile/components/shell/composer.tsx',
  'apps/mobile/components/ui/list-row.tsx',
  'apps/mobile/components/ui/time-field.tsx',
  'apps/web/app/(app)/support/_components/support-form.tsx',
  'apps/web/components/calendar-sync/calendar-sync-event-row.tsx',
  'apps/web/app/(auth)/login/login-sections.tsx',
  'apps/web/components/search/search-results.tsx',
  'apps/web/components/ui/select.tsx',
  'apps/web/components/ui/date-field.tsx',
  'apps/web/components/ui/list-row.tsx',
] as const

const graphicNames: Record<(typeof graphicSites)[number], string> = {
  'apps/mobile/components/auth/login-sections.tsx': 'WifiOff',
  'apps/mobile/components/calendar-sync/calendar-sync-event-row.tsx': 'X',
  'apps/mobile/components/search/search-results.tsx': 'ChevronRight',
  'apps/mobile/components/shell/composer.tsx': 'Plus',
  'apps/mobile/components/ui/list-row.tsx': 'ChevronIcon',
  'apps/mobile/components/ui/time-field.tsx': 'Clock3',
  'apps/web/app/(app)/support/_components/support-form.tsx': 'WifiOff',
  'apps/web/components/calendar-sync/calendar-sync-event-row.tsx': 'X',
  'apps/web/app/(auth)/login/login-sections.tsx': 'WifiOff',
  'apps/web/components/search/search-results.tsx': 'ChevronRight',
  'apps/web/components/ui/select.tsx': 'ChevronDown',
  'apps/web/components/ui/date-field.tsx': 'Calendar',
  'apps/web/components/ui/list-row.tsx': 'Chevron',
}

const raisedSurfaces = {
  canvas: ['--bg'],
  card: ['--bg', '--bg-card'],
  field: ['--bg', '--bg-field'],
  well: ['--bg', '--bg-well'],
  'elev-2': ['--bg', '--bg-elev-2'],
  hover: ['--bg', '--bg-hover'],
  overlay: ['--bg', '--bg-elev'],
} as const

describe.each(['dark', 'light'] as const)('raised-surface graphic contrast in the %s theme', (theme) => {
  const tokens = resolveWebThemeVariables('orange', theme)

  it.each(Object.entries(raisedSurfaces))('keeps the graphic token above the floor on the %s surface', (_surface, layers) => {
    expect(contrastOnSurface(tokens['--fg-3']!, layers.map((layer) => tokens[layer]!))).toBeGreaterThanOrEqual(graphicFloor)
  })
})

describe('raised-surface graphic sites', () => {
  it.each(graphicSites)('%s paints its graphic with the graphic token', (site) => {
    expect(existsSync(resolve(repositoryRoot, site))).toBe(true)
    const source = readFileSync(resolve(repositoryRoot, site), 'utf8')
    if (site === 'apps/web/components/calendar-sync/calendar-sync-event-row.tsx') {
      const dismissalIcon = source.indexOf('<X size={20}')
      expect(dismissalIcon).toBeGreaterThan(0)
      const dismissalButton = source.slice(source.lastIndexOf('<button', dismissalIcon), dismissalIcon)
      expect(dismissalButton).toContain("color: 'var(--fg-3)'")
      return
    }
    const graphicTags = [...source.matchAll(new RegExp(`<${graphicNames[site]}\\b[^>]*>`, 'g'))]
    expect(graphicTags.length).toBeGreaterThan(0)
    expect(graphicTags.some(([tag]) => /tokens\.fg3|var\(--fg-3\)/.test(tag))).toBe(true)
  })
})
