import { mkdirSync, writeFileSync } from 'node:fs'

export function summarize(results, expectedCaseIds) {
  const cases = expectedCaseIds.map((id) => {
    const attempts = results.filter((entry) => entry.testCase.metadata.id === id)
    const passed = attempts.filter((entry) => entry.success === true).length
    const skipped = attempts.filter((entry) => entry.gradingResult?.componentResults
      ?.some((assertion) => assertion.metadata?.skipped === true)).length
    const status = passed < attempts.length ? 'fail' : attempts.length !== 3 || skipped ? 'incomplete' : 'pass'
    return { id, attempts: attempts.length, passed, skipped, pass3: status }
  })
  const unexpected = results.some((entry) => !expectedCaseIds.includes(entry.testCase.metadata.id))
  const status = cases.some((entry) => entry.pass3 === 'fail') ? 'fail'
    : unexpected || !cases.length || cases.some((entry) => entry.pass3 === 'incomplete') ? 'incomplete' : 'pass'
  return { status, k: 3, cases }
}

export function writeReport(summary, directory = 'reports') {
  mkdirSync(directory, { recursive: true })
  const markdown = [
    `Astra launch gate: ${summary.status}`,
    '',
    '| Case | Attempts passed | Tool evidence skipped | pass^3 |',
    '|---|---|---|---|',
    ...summary.cases.map((entry) => `| ${entry.id} | ${entry.passed}/${entry.attempts} | ${entry.skipped} | ${entry.pass3} |`),
    '',
    'Incomplete is not a launch pass. Tool evidence waits on orbit-tickets#1573.',
  ].join('\n')
  writeFileSync(`${directory}/summary.json`, `${JSON.stringify(summary, null, 2)}\n`)
  writeFileSync(`${directory}/summary.md`, `${markdown}\n`)
  return markdown
}
