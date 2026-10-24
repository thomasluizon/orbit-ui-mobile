import { expect, it } from 'vitest'
import { mergeReports } from '../merge-reports.mjs'
const descriptors = [{ id: 'english', family: 'habits', locale: 'en' }, { id: 'portuguese', family: 'habits', locale: 'pt-BR' }]
const window = (index, overrides = {}) => ({ k: 3, cases: [{ ...descriptors[index], attempts: 3, passed: 3, skipped: 0, unavailable: 0, missingComposition: 0, pass3: 'pass', ...overrides }] })
it('merges disjoint windows against the entire corpus without hiding missing families', () => {
  expect(mergeReports([window(0)], descriptors).status).toBe('incomplete')
  const merged = mergeReports([window(0), window(1)], descriptors)
  expect(merged.status).toBe('pass')
  expect(merged.groups).toHaveLength(2)
  expect(mergeReports([window(0), window(1, { pass3: 'fail', passed: 2 })], descriptors).status).toBe('fail')
})
it.each([{ skipped: 1 }, { unavailable: 1 }, { missingComposition: 1 }, { attempts: 2 }, { passed: 2 }])('rejects an unsupported pass: %j', (overrides) => {
  expect(() => mergeReports([window(0, overrides)], descriptors)).toThrow()
})
it('rejects repeated, foreign, mislabeled and overcounted cases', () => {
  for (const windows of [[window(0), window(0)], [window(0, { id: 'unknown' })], [window(0, { family: 'other' })], [window(0, { attempts: 4 })]]) {
    expect(() => mergeReports(windows, descriptors)).toThrow()
  }
})
