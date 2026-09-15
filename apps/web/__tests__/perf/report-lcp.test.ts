import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { summarizeLcp } from '../../perf/report-lcp.mjs'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

describe('authed Today LCP report', () => {
  it('reports the complete noisy batch without asserting a runner-dependent statistic', () => {
    const observedValues = [7977.57175, 7540.904800000004, 7855.43025, 7991.522, 3196.785]

    expect(summarizeLcp(observedValues)).toEqual({
      maximum: 7991.522,
      median: 7855.43025,
      minimum: 3196.785,
      sortedValues: [3196.785, 7540.904800000004, 7855.43025, 7977.57175, 7991.522],
    })
  })

  it('shows that a real 500 ms regression overlaps the unchanged runner distribution', () => {
    const unchangedValues = [6877.5, 7488.3, 7515.1, 7530.5, 7534.4]
    const regressedValues = [6779.4, 6787.6, 7572.5, 7584, 7625.8]
    const unchanged = summarizeLcp(unchangedValues)
    const regressed = summarizeLcp(regressedValues)

    expect(regressed.minimum).toBeLessThan(unchanged.minimum)
    expect(regressed.median - unchanged.median).toBeLessThan(100)
  })

  it('rejects an incomplete Lighthouse batch', () => {
    expect(() => summarizeLcp([7400, 7500, 7600, 7700])).toThrow(
      'Expected 5 LCP values, found 4',
    )
  })

  it('keeps LCP out of the enforced LHCI assertions', () => {
    const config = JSON.parse(
      fs.readFileSync(path.join(repositoryRoot, 'apps/web/lighthouserc.json'), 'utf8'),
    )

    expect(config.ci.assert.assertions['largest-contentful-paint']).toBeUndefined()
  })
})
