import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const LIGHTHOUSE_RUN_COUNT = 5
export const PREVIOUS_LCP_BUDGET_MS = 7800

const LCP_AUDIT_ID = 'largest-contentful-paint'
const SAVED_REPORT_PATTERN = /^lhr-\d+\.json$/

export function summarizeLcp(values) {
  if (values.length !== LIGHTHOUSE_RUN_COUNT) {
    throw new Error(`Expected ${LIGHTHOUSE_RUN_COUNT} LCP values, found ${values.length}`)
  }
  if (!values.every(value => Number.isFinite(value) && value >= 0)) {
    throw new Error('Every LCP value must be a finite, non-negative number')
  }

  const sortedValues = values.toSorted((left, right) => left - right)

  return {
    maximum: sortedValues.at(-1),
    median: sortedValues[2],
    minimum: sortedValues[0],
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
  const summary = summarizeLcp(readLcpValues(reportDirectory))
  const values = summary.sortedValues.map(value => value.toFixed(1)).join(', ')

  process.stdout.write(`LCP values, fastest to slowest: ${values} ms\n`)
  process.stdout.write(
    `LCP report only: min ${summary.minimum.toFixed(1)}, median ${summary.median.toFixed(1)}, max ${summary.maximum.toFixed(1)} ms; previous gate ${PREVIOUS_LCP_BUDGET_MS} ms\n`,
  )
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : ''
if (import.meta.url === invokedPath) {
  try {
    run()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`LCP report could not run: ${message}\n`)
    process.exitCode = 1
  }
}
