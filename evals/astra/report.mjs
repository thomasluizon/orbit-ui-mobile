import { chmodSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { summarizeLatency } from './latency.mjs'

export function writeResults(results, directory = 'reports') {
  const repeats = new Map()
  const attempts = results.map((entry) => {
    const caseId = entry.testCase.metadata.id
    const repeat = (repeats.get(caseId) ?? 0) + 1
    repeats.set(caseId, repeat)
    return { caseId, repeat, pass: entry.success === true,
      httpStatus: entry.response?.output?.httpStatus ?? entry.response?.metadata?.astraHttpStatus ?? entry.response?.metadata?.http?.status ?? null,
      reason: entry.error ?? entry.gradingResult?.reason ?? null,
      assertions: (entry.gradingResult?.componentResults ?? []).map((assertion, index) => ({
        metric: assertion.assertion?.metric ?? entry.testCase.assert?.[index]?.metric ?? null,
        pass: assertion.pass === true, reason: assertion.reason ?? null,
      })),
    }
  })
  mkdirSync(directory, { recursive: true })
  const path = `${directory}/results.json`
  const next = `${path}.next`
  writeFileSync(next, `${JSON.stringify(attempts, null, 2)}\n`, { mode: 0o600 })
  chmodSync(next, 0o600)
  renameSync(next, path)
}

export function summarize(results, expectedCases) {
  const descriptors = expectedCases.map((entry) => typeof entry === 'string' ? { id: entry } : entry)
  const cases = descriptors.map(({ id, family = 'legacy', locale = 'unspecified', readLatency = false }) => {
    const attempts = results.filter((entry) => entry.testCase.metadata.id === id)
    const passed = attempts.filter((entry) => entry.success === true).length
    const skipped = attempts.filter((entry) => entry.gradingResult?.componentResults
      ?.some((assertion) => assertion.metadata?.skipped === true)).length
    const unavailable = attempts.filter((entry) => entry.response?.metadata?.astraPreconditionFailure === true || entry.gradingResult?.componentResults
      ?.some((assertion) => assertion.metadata?.unavailable === true)).length
    const failed = attempts.some((entry) => entry.success !== true && entry.response?.metadata?.astraPreconditionFailure !== true
      && (!entry.gradingResult?.componentResults?.some((assertion) => assertion.metadata?.unavailable === true)
        || entry.gradingResult.componentResults.some((assertion) => assertion.pass === false && !assertion.metadata?.unavailable)))
    const missingComposition = attempts.filter((entry) => !entry.gradingResult?.componentResults
      ?.some((assertion) => assertion.assertion?.metric === 'composition' && typeof assertion.pass === 'boolean')).length
    const unavailableReasons = [...new Set(attempts.flatMap((entry) =>
      entry.response?.metadata?.astraPreconditionFailure === true
        && typeof entry.response.metadata.astraPreconditionReason === 'string'
        ? [entry.response.metadata.astraPreconditionReason] : []))]
    const latency = readLatency ? summarizeLatency(attempts) : undefined
    const status = failed || latency?.status === 'fail' ? 'fail'
      : attempts.length !== 3 || skipped || unavailable || missingComposition || latency?.status === 'incomplete' ? 'incomplete' : 'pass'
    return { id, family, locale, ...(latency ? { latency } : {}), unavailableReasons, missingComposition, attempts: attempts.length, passed, skipped, unavailable, pass3: status }
  })
  const unexpected = results.some((entry) => !descriptors.some((expected) => expected.id === entry.testCase.metadata.id))
  return aggregate(cases, unexpected)
}

export function aggregate(cases, unexpected = false) {
  const status = cases.some((entry) => entry.pass3 === 'fail') ? 'fail'
    : unexpected || !cases.length || cases.some((entry) => entry.pass3 === 'incomplete') ? 'incomplete' : 'pass'
  const groups = [...new Set(cases.map((entry) => `${entry.family}/${entry.locale}`))].map((key) => {
    const members = cases.filter((entry) => `${entry.family}/${entry.locale}` === key)
    return { family: members[0].family, locale: members[0].locale, cases: members.length,
      passed: members.filter((entry) => entry.pass3 === 'pass').length,
      pass3: members.some((entry) => entry.pass3 === 'fail') ? 'fail'
        : members.some((entry) => entry.pass3 === 'incomplete') ? 'incomplete' : 'pass' }
  })
  return { status, k: 3, cases, groups }
}

export function writeReport(summary, directory = 'reports') {
  mkdirSync(directory, { recursive: true })
  const markdown = [
    `Astra launch gate: ${summary.gateStatus ?? summary.status}`,
    `Selected cases: ${summary.status}`,
    '',
    '| Case | Family | Locale | Attempts passed | Evidence skipped | Evidence unavailable | Composition missing | pass^3 |',
    '|---|---|---|---|---|---|---|---|',
    ...summary.cases.map((entry) => `| ${entry.id} | ${entry.family} | ${entry.locale} | ${entry.passed}/${entry.attempts} | ${entry.skipped} | ${entry.unavailable} | ${entry.missingComposition} | ${entry.pass3} |`),
    '',
    '| Family | Locale | Cases passing pass^3 | pass^3 |',
    '|---|---|---|---|',
    ...summary.groups.map((entry) => `| ${entry.family} | ${entry.locale} | ${entry.passed}/${entry.cases} | ${entry.pass3} |`),
    '',
    '| Read case | Median turn ms | Budget ms (exclusive) | Latency |',
    '|---|---|---|---|',
    ...summary.cases.filter((entry) => entry.latency).map((entry) =>
      `| ${entry.id} | ${entry.latency.totalMedianMilliseconds ?? 'missing'} | ${entry.latency.budgetMilliseconds} | ${entry.latency.status} |`),
    '',
    '| Read case | Phase | Median exclusive ms |',
    '|---|---|---|',
    ...summary.cases.flatMap((entry) => Object.entries(entry.latency?.phaseMediansMilliseconds ?? {}).map(([phase, milliseconds]) =>
      `| ${entry.id} | ${phase} | ${milliseconds} |`)),
    '',
    ...summary.cases.filter((entry) => entry.latency?.reason).map((entry) => `${entry.id}: ${entry.latency.reason}`),
    '',
    ...summary.cases.flatMap((entry) => (entry.unavailableReasons ?? []).map((reason) =>
      `${entry.id}: incomplete precondition: ${reason.replace(/[\r\n|]/g, ' ')}`)),
    '',
    'Subset summaries cover selected cases only. Merge all windows before a launch decision.',
    'Incomplete is not a launch pass. PendingConfirmation proves a held proposal, never a persisted write.',
  ].join('\n')
  writeFileSync(`${directory}/summary.json`, `${JSON.stringify(summary, null, 2)}\n`)
  writeFileSync(`${directory}/summary.md`, `${markdown}\n`)
  return markdown
}
