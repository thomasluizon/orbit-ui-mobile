import { ATTEMPTS_PER_CASE } from '../attempts.mjs'
import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { summarize } from '../report.mjs'
const corpus = parse(readFileSync(new URL('../composition-scenarios.yaml', import.meta.url), 'utf8'), { merge: true })
const configuration = parse(readFileSync(new URL('../promptfooconfig.yaml', import.meta.url), 'utf8'))
const scenarios = parse(readFileSync(new URL('../scenarios.yaml', import.meta.url), 'utf8'))
const textOccurrenceCount = /\b(?:appear(?:s)?|occur(?:s)?|mention(?:ed)?|repeat(?:ed)?)\b[^.;]*\b(?:(?:exactly|only) once|once|one (?:time|occurrence)|twice)\b/i
it.each([
  'The stored title Water appears verbatim exactly once in the preview.',
  'The stored title Beber água appears verbatim exactly once in the preview.',
  'Water appears once in the preview.',
  'The title occurs only once in the preview.',
  'Mention the title exactly once in the preview.',
  'The existing Water habit appears exactly once as an adjustment.',
])('rejects text occurrence counting: %s', (rubric) => {
  expect(rubric).toMatch(textOccurrenceCount)
})
it.each([
  "Exactly one preview item carries the stored title Water verbatim; that item's own title field belongs to the same item. No second item has that title.",
  'Exactly one preview item carries the stored title Beber água verbatim.',
  'Exactly one editable draft carries the stored title Water verbatim as an adjustment.',
])('allows item counting: %s', (rubric) => {
  expect(rubric).not.toMatch(textOccurrenceCount)
})
it.each([...corpus, ...scenarios])('grades observable claims in $metadata.id', ({ vars }) => {
  expect(vars.rubric).not.toMatch(textOccurrenceCount)
  const clauses = vars.rubric.split(/[.;]/).filter((clause) => !/\bharness evidence\b/i.test(clause))
  for (const clause of clauses) {
    expect(clause).not.toMatch(/\b(?:habit_id|entityId|by identity|identity reference|create_habit|update_checklist)\b/i)
    expect(clause).not.toMatch(/\bkeep the existing account habits unchanged\b/i)
    if (!['suggestions', 'refine'].includes(vars.composition?.mode)) {
      expect(clause).not.toMatch(/\bexistingHabitId\b/i)
    }
  }
})
it.each(corpus.filter((entry) => entry.metadata.family.startsWith('suggestions')))(
  'keeps checklists optional in $metadata.id', ({ vars }) => {
    const checklistClauses = vars.rubric.split(/[.;]/).filter((clause) => /checklist/i.test(clause))
    for (const clause of checklistClauses) {
      expect(clause).toMatch(/\boptional\b|\bwhen present\b/i)
      expect(clause).not.toMatch(/\brequired\b|\bmust\b|\bmandatory\b/i)
    }
  },
)
it('runs every composition family in both languages with the configured attempts', () => {
  const families = ['habits-schedules', 'logs-history', 'metrics', 'streaks', 'rankings', 'totals', 'comparisons',
    'goals', 'calendar-sync', 'notifications', 'tags', 'checklist-templates', 'profile-settings', 'subscription-plan',
    'referrals', 'api-keys', 'achievements-level', 'retrospectives-recaps', 'writes-outcomes', 'choice', 'pickList',
    'proactive', 'empty', 'error', 'partial', 'stale', 'quota', 'plan', 'offline', 'refusal', 'feature-help',
    'coaching-advice', 'small-talk', 'compound', 'compound-legacy', 'compound-missing-kind', 'medical-batch',
    'medical-correction', 'avoid-form', 'existing-parents', 'suggestions', 'suggestions-duplicate', 'suggestions-refine',
    'restart-preview', 'restart-approve', 'restart-reject', 'restart-preference', 'hoje-next-step']
  expect(configuration.tests).toContain('file://composition-scenarios.yaml')
  expect(configuration.evaluateOptions.repeat).toBe(ATTEMPTS_PER_CASE)
  expect(new Set(corpus.map((entry) => entry.metadata.id)).size).toBe(corpus.length)
  for (const family of families) {
    for (const locale of ['en', 'pt-BR']) {
      const entry = corpus.find((scenario) => scenario.metadata.family === family && scenario.metadata.locale === locale)
      expect(entry, `${family}/${locale}`).toBeDefined()
      expect(entry.vars.clientContext.locale).toBe(locale)
      expect(entry.vars.composition.mode).toBeTruthy()
      expect(entry.vars.rubric).toBeTruthy()
    }
  }
})
it('binds the reported parent and medical cases to strict scope and genuine setup', () => {
  for (const locale of ['en', 'pt-BR']) {
    const find = (family) => corpus.find((entry) => entry.metadata.family === family && entry.metadata.locale === locale).vars
    const parent = find('existing-parents')
    expect(parent.expectations.counts).toEqual({ bulk_create_habits: 1 })
    expect(parent.expectations.forbidden).toContain('create_habit')
    expect(parent.expectations.required[0].arguments.habits.map((habit) => habit.parent_habit_id)).toEqual(['{habitId}', '{secondHabitId}'])
    const medical = find('medical-batch')
    const commitments = medical.expectations.required[0].arguments.habits.slice(2, 4)
    for (const commitment of commitments) {
      expect(commitment.is_bad_habit).toBe(false)
      expect(commitment.frequency_unit).toBe('Day')
      expect(commitment.end_date).toBe('{accountDate+7}')
    }
    expect(medical.rubric).toContain("Preserve the person's own wording")
    expect(medical.rubric).toContain('Reject a title that reverses or changes the medical instruction')
    expect(medical.rubric).toContain('is_bad_habit=false')
    expect(medical.expectations.required[0].arguments.habits.slice(0, 2).every((habit) => habit.frequency_unit === 'OneTime')).toBe(true)
    const correction = find('medical-correction')
    expect(correction.setup.input).toBe(medical.input)
    expect(correction.setup.expectations).toEqual(medical.expectations)
    expect(correction.composition.correction.value).toBe('16:00')
    expect(correction.expectations.required).toEqual([{ name: 'revise_pending_changes', resultStatus: 'PendingConfirmation' }])
    expect(correction.expectations.counts).toEqual({ revise_pending_changes: 1 })
    expect(correction.expectations.allowed).toEqual(['query_habits', 'revise_pending_changes'])
    expect(correction.expectations.forbidden).toEqual(['bulk_create_habits', 'create_habit'])
    expect(correction.rubric).toContain('from the setup preview')
    expect(correction.rubric).not.toContain('one-time types')
    expect(find('plan').composition.actionSurfaces).toEqual(['subscriptions'])
    expect(find('feature-help').composition.actionSurfaces).toEqual(['today'])
  }
})
it.each(['en', 'pt-BR'])('keeps disconnected calendar recovery separate from cached stale reads in %s', (locale) => {
  const entry = corpus.find((scenario) => scenario.metadata.id === `composition-error-${locale}`)
  expect(entry.vars.composition.blocks).toEqual([{ kind: 'calendar', completeness: 'partial', recovery: 'reconnect' }])
  expect(entry.metadata.fixture).not.toBe('composition-stale')
})
it('reports pass^k for each family and locale and carries a failure into its group', () => {
  const descriptors = [{ id: 'en', family: 'habits', locale: 'en' }, { id: 'pt', family: 'habits', locale: 'pt-BR' }]
  const attempts = descriptors.flatMap((metadata) => Array.from({ length: ATTEMPTS_PER_CASE }, () => ({ testCase: { metadata }, success: true,
    gradingResult: { componentResults: [{ pass: true, assertion: { metric: 'composition' } }] } })))
  expect(summarize(attempts, descriptors).groups).toEqual(descriptors.map(({ family, locale }) => ({ family, locale, cases: 1, passed: 1, allAttemptsPass: 'pass' })))
  attempts.find((entry) => entry.testCase.metadata.id === descriptors[1].id).success = false
  expect(summarize(attempts, descriptors).groups[1].allAttemptsPass).toBe('fail')
})
