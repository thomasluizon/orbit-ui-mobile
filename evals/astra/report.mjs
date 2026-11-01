import { chmodSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { summarizeLatency } from './latency.mjs'
import { attemptEvidence } from './evidence.mjs'
import { groundingEvidence } from './grading-input.mjs'
import { ATTEMPTS_PER_CASE } from './attempts.mjs'

const unavailableAssertion = (assertion) => assertion.metadata?.unavailable === true || assertion.metadata?.graderError === true

const graderUnavailable = (entry) => entry.gradingResult?.componentResults?.some((assertion) => assertion.metadata?.graderError === true)

const evidencePath = (caseId, repeat) => `attempts/${encodeURIComponent(caseId)}-r${repeat}.json`

function writePrivateJson(path, value) {
  const next = `${path}.next`
  writeFileSync(next, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  chmodSync(next, 0o600)
  renameSync(next, path)
}

export function writeResults(results, directory = 'reports') {
  mkdirSync(`${directory}/attempts`, { recursive: true, mode: 0o700 })
  chmodSync(directory, 0o700)
  chmodSync(`${directory}/attempts`, 0o700)
  const repeats = new Map()
  const attempts = results.map((entry) => {
    const caseId = entry.testCase.metadata.id
    const repeat = (repeats.get(caseId) ?? 0) + 1
    repeats.set(caseId, repeat)
    const attempt = { caseId, repeat, pass: entry.success === true && !graderUnavailable(entry),
      ...(graderUnavailable(entry) ? { unavailable: true } : {}),
      httpStatus: entry.response?.output?.httpStatus ?? entry.response?.metadata?.astraHttpStatus ?? entry.response?.metadata?.http?.status ?? null,
      reason: entry.error ?? entry.response?.error ?? entry.response?.output?.error ?? entry.gradingResult?.reason ?? null,
      assertions: (entry.gradingResult?.componentResults ?? []).map((assertion, index) => ({
        metric: assertion.assertion?.metric ?? entry.testCase.assert?.[index]?.metric ?? null,
        pass: assertion.pass === true, reason: assertion.reason ?? null,
        ...(unavailableAssertion(assertion) ? { unavailable: true } : {}),
      })),
    }
    const evidence = attemptEvidence(entry, { ...attempt,
      groundingEvidence: groundingEvidence(entry.response?.output ?? {}, entry.testCase.vars ?? {}),
    })
    writePrivateJson(`${directory}/${evidencePath(caseId, repeat)}`, evidence)
    return Object.fromEntries(Object.keys(attempt).map((key) => [key, evidence[key]]))
  })
  writePrivateJson(`${directory}/results.json`, attempts)
}

export function summarize(results, expectedCases) {
  const descriptors = expectedCases.map((entry) => typeof entry === 'string' ? { id: entry } : entry)
  const cases = descriptors.map(({ id, family = 'legacy', locale = 'unspecified', readLatency = false }) => {
    const attempts = results.filter((entry) => entry.testCase.metadata.id === id)
    const passed = attempts.filter((entry) => entry.success === true && !entry.gradingResult?.componentResults
      ?.some(unavailableAssertion) && entry.response?.metadata?.astraPreconditionFailure !== true).length
    const skipped = attempts.filter((entry) => entry.gradingResult?.componentResults
      ?.some((assertion) => assertion.metadata?.skipped === true)).length
    const unavailable = attempts.filter((entry) => entry.response?.metadata?.astraPreconditionFailure === true || entry.gradingResult?.componentResults
      ?.some(unavailableAssertion)).length
    const failed = attempts.some((entry) => entry.success !== true && !graderUnavailable(entry) && entry.response?.metadata?.astraPreconditionFailure !== true
      && (!entry.gradingResult?.componentResults?.some(unavailableAssertion)
        || entry.gradingResult.componentResults.some((assertion) => assertion.pass === false && !unavailableAssertion(assertion))))
    const missingComposition = attempts.filter((entry) => !entry.gradingResult?.componentResults
      ?.some((assertion) => assertion.assertion?.metric === 'composition' && typeof assertion.pass === 'boolean')).length
    const unavailableReasons = [...new Set(attempts.flatMap((entry) =>
      entry.response?.metadata?.astraPreconditionFailure === true
        && typeof entry.response.metadata.astraPreconditionReason === 'string'
        ? [entry.response.metadata.astraPreconditionReason]
        : (entry.gradingResult?.componentResults ?? []).filter(unavailableAssertion)
          .map((assertion) => assertion.reason).filter((reason) => typeof reason === 'string')))]
    const latency = readLatency ? summarizeLatency(attempts.filter((entry) => !graderUnavailable(entry))) : undefined
    const status = failed || latency?.status === 'fail' ? 'fail'
      : attempts.length !== ATTEMPTS_PER_CASE || passed !== ATTEMPTS_PER_CASE || skipped || unavailable || missingComposition || latency?.status === 'incomplete' ? 'incomplete' : 'pass'
    return { id, family, locale, ...(latency ? { latency } : {}), unavailableReasons, missingComposition, attempts: attempts.length, passed, skipped, unavailable, allAttemptsPass: status }
  })
  const unexpected = results.some((entry) => !descriptors.some((expected) => expected.id === entry.testCase.metadata.id))
  return aggregate(cases, unexpected)
}

export function aggregate(cases, unexpected = false) {
  const status = cases.some((entry) => entry.allAttemptsPass === 'fail') ? 'fail'
    : unexpected || !cases.length || cases.some((entry) => entry.allAttemptsPass === 'incomplete') ? 'incomplete' : 'pass'
  const groups = [...new Set(cases.map((entry) => `${entry.family}/${entry.locale}`))].map((key) => {
    const members = cases.filter((entry) => `${entry.family}/${entry.locale}` === key)
    return { family: members[0].family, locale: members[0].locale, cases: members.length,
      passed: members.filter((entry) => entry.allAttemptsPass === 'pass').length,
      allAttemptsPass: members.some((entry) => entry.allAttemptsPass === 'fail') ? 'fail'
        : members.some((entry) => entry.allAttemptsPass === 'incomplete') ? 'incomplete' : 'pass' }
  })
  return { status, k: ATTEMPTS_PER_CASE, cases, groups }
}

export function writeReport(summary, directory = 'reports') {
  mkdirSync(directory, { recursive: true })
  const markdown = [
    `Astra launch gate: ${summary.gateStatus ?? summary.status}`,
    `Selected cases: ${summary.status}`,
    `Attempts per case (k): ${summary.k}`,
    '',
    '| Case | Family | Locale | Attempts passed | Evidence skipped | Evidence unavailable | Composition missing | pass^k | Attempts |',
    '|---|---|---|---|---|---|---|---|---|',
    ...summary.cases.map((entry) => {
      const evidence = entry.allAttemptsPass === 'fail' ? Array.from({ length: entry.attempts }, (_, index) =>
        `[r${index + 1}](${evidencePath(entry.id, index + 1)})`).join(', ') : ''
      return `| ${entry.id} | ${entry.family} | ${entry.locale} | ${entry.passed}/${entry.attempts} | ${entry.skipped} | ${entry.unavailable} | ${entry.missingComposition} | ${entry.allAttemptsPass} | ${evidence} |`
    }),
    '',
    '| Family | Locale | Cases passing pass^k | pass^k |',
    '|---|---|---|---|',
    ...summary.groups.map((entry) => `| ${entry.family} | ${entry.locale} | ${entry.passed}/${entry.cases} | ${entry.allAttemptsPass} |`),
    '',
    '| Replaced case | Final window | Superseded window | Superseded attempts passed (not counted) | Superseded verdict |',
    '|---|---|---|---|---|',
    ...summary.cases.flatMap((entry) => (entry.superseded ?? []).map((previous) =>
      `| ${entry.id} | ${entry.sourceWindow} | ${previous.sourceWindow} | ${previous.passed}/${previous.attempts} | ${previous.allAttemptsPass} |`)),
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
      `${entry.id}: incomplete evidence: ${reason.replace(/[\r\n|]/g, ' ')}`)),
    '',
    'Subset summaries cover selected cases only. Merge all windows before a launch decision.',
    'Incomplete is not a launch pass. PendingConfirmation proves a held proposal, never a persisted write.',
  ].join('\n')
  writeFileSync(`${directory}/summary.json`, `${JSON.stringify(summary, null, 2)}\n`)
  writeFileSync(`${directory}/summary.md`, `${markdown}\n`)
  return markdown
}
