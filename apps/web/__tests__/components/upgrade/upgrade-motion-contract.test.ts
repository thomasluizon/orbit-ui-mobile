import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const motionSources = [
  'apps/web/components/upgrade/plan-selection.tsx',
  'apps/web/app/(app)/upgrade/page.tsx',
  'apps/mobile/components/upgrade/plan-selection.tsx',
  'apps/mobile/app/upgrade.tsx',
].map((path) => readFileSync(resolve(process.cwd(), '../..', path), 'utf8')).join('\n')

describe('upgrade motion contract', () => {
  it('names every required purpose on both platforms', () => {
    expect(motionSources.match(/spatial consistency/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
    expect(motionSources.match(/preventing a jarring change/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  })

  it('keeps the remaining transition to opacity without forbidden easing', () => {
    expect(motionSources).toContain('opacity')
    expect(motionSources).not.toMatch(/transition-all|springify|withSpring|Bounce|bounce|elastic/)
  })

  it('connects both platform reduced-motion adapters', () => {
    expect(motionSources).toContain('useReducedMotion')
    expect(motionSources).toContain('usePrefersReducedMotion')
  })
})
