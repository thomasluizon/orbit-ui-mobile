// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as utils from '../utils'

const BARREL_LINE_LIMIT = 1000

describe('the utils barrel', () => {
  it('stays within the file length limit', () => {
    const lines = readFileSync(resolve(__dirname, '../utils/index.ts'), 'utf8').trimEnd().split('\n').length
    expect(lines).toBeLessThanOrEqual(BARREL_LINE_LIMIT)
  })

  it('does not export a constant that only the habit detail flow reads', () => {
    expect(Object.keys(utils)).not.toContain('HABIT_SLIPPING_RATE_LIMIT')
  })
})
