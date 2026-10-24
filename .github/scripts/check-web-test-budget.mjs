#!/usr/bin/env node

import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const usage = 'usage: check-web-test-budget.mjs <timings-directory> <budget-ms>\nExit codes: 0 within budget, 1 over budget or invalid reports, 2 invalid arguments'
const argumentsList = process.argv.slice(2)
if (argumentsList.length === 1 && ['--help', '-h'].includes(argumentsList[0])) {
  console.log(usage)
  process.exit(0)
}
const [directory, budgetText] = argumentsList
const budget = Number(budgetText)
if (argumentsList.length !== 2 || !directory || directory.startsWith('-') || !Number.isFinite(budget) || budget <= 0) {
  console.error(usage)
  process.exit(2)
}

try {
  const reports = readdirSync(resolve(directory)).filter(name => name.endsWith('.json'))
  if (!reports.length) throw new Error('No timing reports found')
  let fileCount = 0
  const violations = []
  for (const report of reports) {
    const { testResults } = JSON.parse(readFileSync(join(directory, report), 'utf8'))
    if (!Array.isArray(testResults) || !testResults.length) throw new Error(`${report}: no test file timings`)
    for (const file of testResults) {
      const { name, startTime, endTime } = file
      if (typeof name !== 'string' || !name || !Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime < startTime) {
        throw new Error(`${report}: invalid test file timing`)
      }
      fileCount++
      const duration = endTime - startTime
      if (duration > budget) violations.push(`${name}: ${(duration / 1000).toFixed(3)}s exceeds ${(budget / 1000).toFixed(3)}s`)
    }
  }
  if (violations.length) throw new Error(violations.join('\n'))
  console.log(`${fileCount} test files within ${(budget / 1000).toFixed(3)}s per file`)
} catch (error) {
  console.error(`web test budget: ${error.message}`)
  process.exit(1)
}
