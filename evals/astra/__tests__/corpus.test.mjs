import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { summarize } from '../report.mjs'
const corpus = parse(readFileSync(new URL('../composition-scenarios.yaml', import.meta.url), 'utf8'))
const configuration = parse(readFileSync(new URL('../promptfooconfig.yaml', import.meta.url), 'utf8'))
it.each(corpus.filter((entry) => entry.metadata.family.startsWith('suggestions')))(
  'keeps checklists optional in $metadata.id', ({ vars }) => {
    const checklistClauses = vars.rubric.split(/[.;]/).filter((clause) => /checklist/i.test(clause))
    for (const clause of checklistClauses) {
      expect(clause).toMatch(/\boptional\b|\bwhen present\b/i)
      expect(clause).not.toMatch(/\brequired\b|\bmust\b|\bmandatory\b/i)
    }
  },
)
it('runs every composition family in both languages with three attempts', () => {
  const families = ['habits-schedules', 'logs-history', 'metrics', 'streaks', 'rankings', 'totals', 'comparisons',
    'goals', 'calendar-sync', 'notifications', 'tags', 'checklist-templates', 'profile-settings', 'subscription-plan',
    'referrals', 'api-keys', 'achievements-level', 'retrospectives-recaps', 'writes-outcomes', 'choice', 'pickList',
    'proactive', 'empty', 'error', 'partial', 'stale', 'quota', 'plan', 'offline', 'refusal', 'feature-help',
    'coaching-advice', 'small-talk', 'compound', 'compound-legacy', 'compound-missing-kind', 'medical-batch',
    'medical-correction', 'avoid-form', 'existing-parents', 'suggestions', 'suggestions-duplicate', 'suggestions-refine',
    'restart-preview', 'restart-approve', 'restart-reject', 'restart-preference']
  expect(configuration.tests).toContain('file://composition-scenarios.yaml')
  expect(configuration.evaluateOptions.repeat).toBe(3)
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
      expect(medical.rubric).toContain(commitment.title.textContains)
    }
    expect(medical.rubric).toContain('is_bad_habit=false')
    expect(medical.expectations.required[0].arguments.habits.slice(0, 2).every((habit) => habit.frequency_unit === 'OneTime')).toBe(true)
    const correction = find('medical-correction')
    expect(correction.setup.input).toBe(medical.input)
    expect(correction.setup.expectations).toEqual(medical.expectations)
    expect(correction.composition.correction.value).toBe('16:00')
    expect(correction.expectations.required).toEqual([{ name: 'bulk_create_habits', exactArguments: true, resultStatus: 'PendingConfirmation' }])
    expect(correction.expectations.counts).toEqual({ bulk_create_habits: 1 })
    expect(find('plan').composition.actionSurfaces).toEqual(['subscriptions'])
    expect(find('feature-help').composition.actionSurfaces).toEqual(['today'])
  }
})
it.each(['en', 'pt-BR'])('keeps disconnected calendar recovery separate from cached stale reads in %s', (locale) => {
  const entry = corpus.find((scenario) => scenario.metadata.id === `composition-error-${locale}`)
  expect(entry.vars.composition.blocks).toEqual([{ kind: 'calendar', completeness: 'partial', recovery: 'reconnect' }])
  expect(entry.metadata.fixture).not.toBe('composition-stale')
})
it('reports pass^3 for each family and locale and carries a failure into its group', () => {
  const descriptors = [{ id: 'en', family: 'habits', locale: 'en' }, { id: 'pt', family: 'habits', locale: 'pt-BR' }]
  const attempts = descriptors.flatMap((metadata) => Array.from({ length: 3 }, () => ({ testCase: { metadata }, success: true,
    gradingResult: { componentResults: [{ pass: true, assertion: { metric: 'composition' } }] } })))
  expect(summarize(attempts, descriptors).groups).toEqual(descriptors.map(({ family, locale }) => ({ family, locale, cases: 1, passed: 1, pass3: 'pass' })))
  attempts[5].success = false
  expect(summarize(attempts, descriptors).groups[1].pass3).toBe('fail')
})
