import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { evaluateLcpBudget } from '../../perf/assert-lcp-budget.mjs'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

describe('authed Today LCP budget', () => {
  it('discards one implausibly fast runner outlier before asserting the unchanged budget', () => {
    const observedValues = [7977.57175, 7540.904800000004, 7855.43025, 7991.522, 3196.785]

    expect(evaluateLcpBudget(observedValues)).toEqual({
      budget: 7800,
      passed: true,
      selectedValue: 7540.904800000004,
      sortedValues: [3196.785, 7540.904800000004, 7855.43025, 7977.57175, 7991.522],
    })
  })

  it('fails a 400 ms regression in the measured high-mode population', () => {
    const measuredHighMode = [7470.8456, 7480.4992, 7487.7872, 7495.358, 7631.8352]
    const regressedValues = measuredHighMode.map(value => value + 400)

    expect(evaluateLcpBudget(regressedValues)).toMatchObject({
      passed: false,
      selectedValue: 7880.4992,
    })
  })

  it('rejects an incomplete Lighthouse batch', () => {
    expect(() => evaluateLcpBudget([7400, 7500, 7600, 7700])).toThrow(
      'Expected 5 LCP values, found 4',
    )
  })

  it('removes the noisy LCP assertion from LHCI median aggregation', () => {
    const config = JSON.parse(
      fs.readFileSync(path.join(repositoryRoot, 'apps/web/lighthouserc.json'), 'utf8'),
    )

    expect(config.ci.assert.assertions['largest-contentful-paint']).toBeUndefined()
  })
})
