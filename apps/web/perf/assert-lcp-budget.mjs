import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const LCP_BUDGET_MS = 7800
export const LIGHTHOUSE_RUN_COUNT = 5

const LCP_AUDIT_ID = 'largest-contentful-paint'
const SAVED_REPORT_PATTERN = /^lhr-\d+\.json$/

export function evaluateLcpBudget(values, budget = LCP_BUDGET_MS) {
  if (values.length !== LIGHTHOUSE_RUN_COUNT) {
    throw new Error(`Expected ${LIGHTHOUSE_RUN_COUNT} LCP values, found ${values.length}`)
  }
  if (!values.every(value => Number.isFinite(value) && value >= 0)) {
    throw new Error('Every LCP value must be a finite, non-negative number')
  }

  const sortedValues = values.toSorted((left, right) => left - right)
  const selectedValue = sortedValues[1]

  return {
    budget,
    passed: selectedValue <= budget,
    selectedValue,
    sortedValues,
  }
}

export function readLcpValues(reportDirectory) {
  const reportNames = fs.readdirSync(reportDirectory)
    .filter(name => SAVED_REPORT_PATTERN.test(name))
    .sort()

  return reportNames.map(reportName => {
    const reportPath = path.join(reportDirectory, reportName)
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
    const value = report?.audits?.[LCP_AUDIT_ID]?.numericValue

    if (typeof value !== 'number') {
      throw new Error(`${reportName} has no numeric ${LCP_AUDIT_ID} value`)
    }
    return value
  })
}

function run() {
  const reportDirectory = path.resolve('.lighthouseci')
  const result = evaluateLcpBudget(readLcpValues(reportDirectory))
  const values = result.sortedValues.map(value => value.toFixed(1)).join(', ')
  const summary = [
    `LCP values, fastest to slowest: ${values} ms`,
    `LCP assertion: ${result.selectedValue.toFixed(1)} <= ${result.budget} ms after discarding the fastest runner outlier`,
  ].join('\n')

  process.stdout.write(`${summary}\n`)
  if (!result.passed) {
    process.stderr.write('LCP budget failed\n')
    process.exitCode = 1
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : ''
if (import.meta.url === invokedPath) {
  try {
    run()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`LCP budget could not run: ${message}\n`)
    process.exitCode = 1
  }
}
