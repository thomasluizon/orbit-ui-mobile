import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const scannerTimeout = 120_000
const graphicSites = [
  'apps/mobile/app/support.tsx',
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
  'apps/web/components/ui/app-select.tsx',
  'apps/web/components/ui/date-field.tsx',
  'apps/web/components/ui/list-row.tsx',
] as const

const graphicNames: Record<(typeof graphicSites)[number], string> = {
  'apps/mobile/app/support.tsx': 'WifiOff',
  'apps/mobile/components/auth/login-sections.tsx': 'WifiOff',
  'apps/mobile/components/calendar-sync/calendar-sync-event-row.tsx': 'X',
  'apps/mobile/components/search/search-results.tsx': 'ChevronRight',
  'apps/mobile/components/shell/composer.tsx': 'ArrowUp',
  'apps/mobile/components/ui/list-row.tsx': 'ChevronIcon',
  'apps/mobile/components/ui/time-field.tsx': 'Clock3',
  'apps/web/app/(app)/support/_components/support-form.tsx': 'WifiOff',
  'apps/web/components/calendar-sync/calendar-sync-event-row.tsx': 'X',
  'apps/web/app/(auth)/login/login-sections.tsx': 'WifiOff',
  'apps/web/components/search/search-results.tsx': 'ChevronRight',
  'apps/web/components/ui/app-select.tsx': 'ChevronDown',
  'apps/web/components/ui/date-field.tsx': 'Calendar',
  'apps/web/components/ui/list-row.tsx': 'Chevron',
}

function scanSources() {
  return spawnSync(process.execPath, ['tools/check-surface-scope.mjs'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    timeout: scannerTimeout,
    killSignal: 'SIGKILL',
  })
}

let result: ReturnType<typeof scanSources>
let findings: string[]

describe('raised-surface graphic contrast', () => {
  beforeAll(() => {
    result = scanSources()
    findings = result.stderr.split('\n')
  }, scannerTimeout + 5_000)

  it('checks the full source tree without a scanner error', () => {
    expect(result.error, `Surface contrast scanner must finish within ${scannerTimeout}ms`).toBeUndefined()
    expect(result.status, result.stderr).toBe(0)
    expect(findings.filter((line) => line.includes('GRAPHIC floor 3.00'))).toEqual([])
  })

  it.each(graphicSites)('%s resolves its graphic role above the floor', (site) => {
    expect(existsSync(resolve(repositoryRoot, site))).toBe(true)
    expect(result.error).toBeUndefined()
    expect(findings.filter((line) => line.startsWith(`${site}:`) && /GRAPHIC (?:floor 3\.00|surface is unresolved)/.test(line))).toEqual([])
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
