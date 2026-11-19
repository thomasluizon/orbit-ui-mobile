import { ATTEMPTS_PER_CASE } from '../attempts.mjs'
import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { summarize } from '../report.mjs'
import { TOOL_NAME_KEYS, gradedByOutcome, readCorpus } from '../grade-method.mjs'
const corpus = parse(readFileSync(new URL('../composition-scenarios.yaml', import.meta.url), 'utf8'), { merge: true })
const configuration = parse(readFileSync(new URL('../promptfooconfig.yaml', import.meta.url), 'utf8'))
const scenarios = parse(readFileSync(new URL('../scenarios.yaml', import.meta.url), 'utf8'))
const textOccurrenceCount = /\b(?:appear(?:s)?|occur(?:s)?|mention(?:ed)?|repeat(?:ed)?)\b[^.;]*\b(?:(?:exactly|only) once|once|one (?:time|occurrence)|twice)\b/i
it('includes every scenario identity in the launch corpus', () => {
  expect(corpus).toHaveLength(184)
  expect(scenarios).toHaveLength(51)
  expect(new Set([...corpus, ...scenarios].map((entry) => entry.metadata.id)).size).toBe(235)
})
// The merge (merge-reports.mjs) and the reset (fixtures/reset.mjs) take the corpus from readCorpus, so a module that names a
// corpus file by itself, in any quote and in any folder of the eval or of tools, is a second reader that can drift.
it('names the corpus files in one module, which the merge and the reset read', async () => {
  const { readdirSync } = await import('node:fs')
  const { join, relative } = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const evals = fileURLToPath(new URL('..', import.meta.url))
  const modules = (folder) => readdirSync(folder, { withFileTypes: true }).flatMap((entry) => entry.isDirectory()
    ? ['__tests__', 'node_modules'].includes(entry.name) ? [] : modules(join(folder, entry.name))
    : entry.name.endsWith('.mjs') ? [join(folder, entry.name)] : [])
  const naming = [...modules(evals), ...modules(fileURLToPath(new URL('../../../tools', import.meta.url)))]
    .filter((path) => readFileSync(path, 'utf8').includes('scenarios.yaml'))
  expect(naming.map((path) => relative(evals, path))).toEqual(['grade-method.mjs'])
})
it.each([
  ['goal-behind', ['at_risk', 'behind']],
  ['goal-on-track', ['on_track', 'completed', 'no_deadline']],
  ['reminder-gap', ['reminders_off', 'reminders_on']],
  ['goal-gap', ['no_equivalent_goal', 'equivalent_goal']],
])('reports every explicit %s state in both locales', (family, states) => {
  const entries = corpus.filter((entry) => entry.metadata.family === `offers-${family}`)
  for (const locale of ['en', 'pt-BR']) {
    const localized = entries.filter((entry) => entry.metadata.locale === locale)
    expect(localized.map((entry) => entry.vars.offerState)).toEqual(states)
    expect(localized[0].metadata.id).toBe(`offers-${family}-${locale}`)
    const { offerState: _state, rubric: _rubric, ...original } = localized[0].vars
    for (const entry of localized.slice(1)) {
      const { offerState: _selected, rubric: _grading, ...variant } = entry.vars
      expect(variant).toEqual(family === 'goal-on-track' && entry.vars.offerState === 'completed' ? {
        ...original, input: locale === 'en' ? 'Show my completed goals and their progress.' : 'Mostre minhas metas concluídas e o progresso delas.',
        composition: { mode: 'data', kinds: ['goalList'] }, expectations: { allowed: ['query_goals'], required: [{ name: 'query_goals',
          argumentsAnyOf: [{ status: 'Completed' }, { status: { optional: null }, include_completed: true }], resultStatus: 'Succeeded' }] },
      } : original)
    }
  }
  const attempts = entries.flatMap(({ metadata }) => Array.from({ length: ATTEMPTS_PER_CASE }, () => ({
    testCase: { metadata }, success: true,
    gradingResult: { componentResults: [{ pass: true, assertion: { metric: 'composition' } }] },
  })))
  expect(summarize(attempts, entries.map((entry) => entry.metadata)).groups).toEqual(['en', 'pt-BR'].map((locale) => ({
    family: `offers-${family}`, locale, cases: states.length, passed: states.length, allAttemptsPass: 'pass',
  })))
})
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
// The first group of the corpus: each case of these families states its expected outcome and holds no tool-name grade.
const firstGroupScenarios = ['single-read-en', 'single-create-pt', 'single-log-en', 'compound-update-skip-en', 'bulk-log-en', 'bulk-skip-pt',
  'ambiguity-pt', 'ambiguity-en', 'injection-user-en', 'injection-record-pt', 'moderation-en', 'grounding-en', 'grounding-missing-pt', 'voice-en',
  'voice-pt', 'edge-overdue-en', 'edge-skipped-pt', 'edge-free-limit-en', 'budget-cap-en', 'legacy-create-pt', 'legacy-moderation-pt']
const firstGroupCompositionFamilies = ['hoje-next-step', 'habits-schedules', 'logs-history', 'metrics', 'streaks', 'rankings', 'totals',
  'comparisons', 'goals', 'calendar-sync', 'notifications', 'tags', 'checklist-templates', 'profile-settings', 'subscription-plan', 'referrals',
  'api-keys', 'achievements-level', 'retrospectives-recaps', 'choice', 'pickList', 'proactive', 'empty', 'partial', 'stale', 'error', 'offline',
  'plan', 'feature-help', 'coaching-advice', 'small-talk', 'refusal', 'writes-outcomes', 'compound', 'quota', 'compound-legacy',
  'compound-missing-kind', 'medical-batch', 'medical-correction', 'avoid-form', 'existing-parents']
const firstGroupIds = [...firstGroupScenarios, ...firstGroupCompositionFamilies.flatMap((family) => ['en', 'pt-BR'].map((locale) => `composition-${family}-${locale}`))]
const everyCase = [...scenarios, ...corpus]
const firstGroupFamilies = new Set(['single', 'bilingual', 'compound', 'bulk', 'ambiguity', 'guardrail', 'moderation', 'grounding', 'voice', 'edge',
  'budget', 'legacy', ...firstGroupCompositionFamilies])
const heldKeys = (value) => !value || typeof value !== 'object' ? []
  : Object.entries(value).flatMap(([key, child]) => [...(Array.isArray(value) ? [] : [key]), ...heldKeys(child)])
const outcomeForm = (vars) => ['changes', 'question', 'read', 'refusal'].filter((form) => vars.outcome[form])

it('keeps each case of the first group, in 52 families', () => {
  expect(firstGroupIds).toHaveLength(103)
  expect(firstGroupFamilies.size).toBe(52)
  const firstGroup = everyCase.filter((entry) => firstGroupFamilies.has(entry.metadata.family))
  expect(firstGroup.map((entry) => entry.metadata.id).toSorted()).toEqual(firstGroupIds.toSorted())
})
it.each(firstGroupIds)('grades %s by its outcome and by no tool name', (id) => {
  const { vars } = everyCase.find((entry) => entry.metadata.id === id)
  expect(gradedByOutcome(vars)).toBe(true)
  expect(heldKeys(vars).filter((key) => key === 'expectations' || TOOL_NAME_KEYS.includes(key))).toEqual([])
  expect(outcomeForm(vars)).toHaveLength(1)
  expect(heldKeys(vars.outcome).filter((key) => /Id$/u.test(key))).toEqual([])
  expect(JSON.stringify(vars.outcome)).not.toMatch(/\{(?:habitId|secondHabitId)\}|[0-9a-f]{8}-[0-9a-f]{4}-/u)
  if (vars.setup) expect(vars.setup.outcome.changes.length).toBeGreaterThan(0)
})
it('counts the cases of each outcome form', () => {
  const forms = Object.groupBy(everyCase.filter((entry) => gradedByOutcome(entry.vars)), (entry) => outcomeForm(entry.vars)[0])
  expect(Object.fromEntries(Object.entries(forms).map(([form, entries]) => [form, entries.length]))).toEqual({ read: 74, changes: 19, question: 6, refusal: 4 })
})
it('gives each case one grade method', () => {
  for (const { metadata, vars } of everyCase) {
    const toolNames = vars.expectations !== undefined || metadata.family.startsWith('offers-')
    expect(gradedByOutcome(vars) !== toolNames, metadata.id).toBe(true)
  }
})
it('keeps the rubric of each case but a write case, whose held preview no model grades', () => {
  for (const { metadata, vars } of everyCase) expect(Boolean(vars.rubric), metadata.id).toBe(!vars.outcome?.changes)
})
it.each(everyCase.filter((entry) => entry.vars.rubric))('grades observable claims in $metadata.id', ({ vars }) => {
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
  expect(configuration.tests).toBe('file://grade-method.mjs:corpusTests')
  expect(configuration.evaluateOptions.repeat).toBe(ATTEMPTS_PER_CASE)
  expect(new Set(corpus.map((entry) => entry.metadata.id)).size).toBe(corpus.length)
  for (const family of families) {
    for (const locale of ['en', 'pt-BR']) {
      const entry = corpus.find((scenario) => scenario.metadata.family === family && scenario.metadata.locale === locale)
      expect(entry, `${family}/${locale}`).toBeDefined()
      expect(entry.vars.clientContext.locale).toBe(locale)
      expect(entry.vars.composition.mode).toBeTruthy()
    }
  }
})
it('binds the reported parent and medical cases to strict scope and genuine setup', () => {
  for (const locale of ['en', 'pt-BR']) {
    const find = (family) => corpus.find((entry) => entry.metadata.family === family && entry.metadata.locale === locale).vars
    const parent = find('existing-parents')
    expect(parent.composition.previews).toBe(1)
    expect(parent.outcome.changes.map((change) => [change.kind, change.fields.parent_habit_id])).toEqual([
      ['create', { record: 'first' }], ['create', { record: 'second' }]])
    const medical = find('medical-batch')
    expect(medical.outcome.changes.map((change) => change.kind)).toEqual(Array(5).fill('create'))
    const commitments = medical.outcome.changes.slice(2, 4)
    for (const commitment of commitments) {
      expect(commitment.fields.is_bad_habit).toEqual({ contains: ['false'] })
      expect(commitment.fields.frequency_unit).toBe('Day')
      expect(commitment.fields.end_date).toBe('{accountDate+7}')
    }
    expect([0, 1, 4].every((index) => medical.outcome.changes[index].fields.frequency_unit === 'OneTime')).toBe(true)
    const correction = find('medical-correction')
    expect(correction.setup.input).toBe(medical.input)
    expect(correction.setup.outcome).toEqual(medical.outcome)
    expect(correction.composition.correction.value).toBe('16:00')
    expect(correction.outcome.changes[0].fields.due_time).toEqual({ time: '16:00' })
    expect(correction.outcome.changes.slice(1)).toEqual(medical.outcome.changes.slice(1))
    expect({ ...correction.outcome.changes[0].fields, due_time: medical.outcome.changes[0].fields.due_time }).toEqual(medical.outcome.changes[0].fields)
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
