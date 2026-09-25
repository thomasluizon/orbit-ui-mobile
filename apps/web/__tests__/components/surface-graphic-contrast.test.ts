import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const graphicSites = [
  'apps/mobile/app/support.tsx',
  'apps/mobile/components/auth/login-sections.tsx',
  'apps/mobile/components/calendar-sync/calendar-sync-event-row.tsx',
  'apps/mobile/components/search/search-results.tsx',
  'apps/mobile/components/shell/composer.tsx',
  'apps/mobile/components/ui/list-row.tsx',
  'apps/mobile/components/ui/settings-group-list.tsx',
  'apps/mobile/components/ui/settings-group.tsx',
  'apps/mobile/components/ui/settings-row.tsx',
  'apps/mobile/components/ui/time-field.tsx',
  'apps/web/app/(app)/support/_components/support-form.tsx',
  'apps/web/app/(auth)/login/login-sections.tsx',
  'apps/web/components/search/search-results.tsx',
  'apps/web/components/ui/app-select.tsx',
  'apps/web/components/ui/date-field.tsx',
  'apps/web/components/ui/list-row.tsx',
  'apps/web/components/ui/settings-group-list.tsx',
  'apps/web/components/ui/settings-group.tsx',
  'apps/web/components/ui/settings-row.tsx',
] as const

const result = spawnSync(process.execPath, ['tools/check-surface-scope.mjs'], {
  cwd: repositoryRoot,
  encoding: 'utf8',
})
const findings = result.stderr.split('\n')

describe('raised-surface graphic contrast', () => {
  it('checks the full source tree without a scanner error', () => {
    expect(result.error).toBeUndefined()
    expect([0, 1]).toContain(result.status)
    expect(findings.filter((line) => line.includes('GRAPHIC floor 3.00'))).toEqual([])
  })

  it.each(graphicSites)('%s resolves its graphic role above the floor', (site) => {
    expect(existsSync(resolve(repositoryRoot, site))).toBe(true)
    expect(result.error).toBeUndefined()
    expect(findings.filter((line) => line.startsWith(`${site}:`) && /GRAPHIC (?:floor 3\.00|surface is unresolved)/.test(line))).toEqual([])
  })
})
