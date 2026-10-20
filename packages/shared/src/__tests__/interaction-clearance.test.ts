import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { INTERACTION_FILL_CLEARANCE } from '../theme'

describe('shared interaction fill clearance', () => {
  it('uses the first spacing step on both platform guards', () => {
    expect(INTERACTION_FILL_CLEARANCE).toBe(4)
    for (const file of [
      'apps/web/e2e/layout/interaction-fill-clearance.spec.ts',
      'apps/mobile/__tests__/components/ui/interaction-fill-clearance.test.tsx',
    ]) {
      const source = readFileSync(resolve(import.meta.dirname, '../../../..', file), 'utf8')
      expect(source).toMatch(/import \{[^}]*\bINTERACTION_FILL_CLEARANCE\b[^}]*\} from '@orbit\/shared\/theme'/)
      expect(source.match(/INTERACTION_FILL_CLEARANCE/g)!.length).toBeGreaterThan(1)
      expect(source).not.toMatch(/(?:const|let) INTERACTION_FILL_CLEARANCE/)
    }
  })
})
