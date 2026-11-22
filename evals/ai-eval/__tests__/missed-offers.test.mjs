import { expect, it } from 'vitest'
import { proactiveOffers } from '../proactive-offers.mjs'

const today = '2031-06-10'
const waterId = '22222222-2222-4222-8222-222222222222'
const walkId = '33333333-3333-4333-8333-333333333333'

// Producer: ProactiveOfferPlanner.HabitRows, MissedDates and AddSkipOffer; seedRestart's non-daily fixture.
function missedOffer(family = 'skip', date = '2031-06-08') {
  const action = { offerKey: `${family}:${waterId}${date ? `:${date}` : ''}`, kind: 'preparePreview',
    label: 'Skip', prompt: 'Skip Water on 06/08/2031.', surface: null, entityId: waterId, date }
  const block = { scope: 'today', date: today, items: [{ id: waterId, title: 'Water', isBadHabit: false, status: 'overdue' }],
    read: { queryId: waterId, queryFamily: 'query_habits', scope: {}, revision: 'revision', refreshToken: 'refresh',
      completeness: 'complete', recovery: null, nextAction: action } }
  const habits = [
    { id: waterId, title: 'Water', isBadHabit: false, isCompleted: false, isFlexible: false, isGeneral: false,
      frequencyUnit: 'Day', frequencyQuantity: 3, days: [], intervalWeeks: null,
      dueDate: '2031-06-08', scheduledStartDate: '2031-06-08', endDate: null, logs: [] },
    { id: walkId, title: 'Walk', isBadHabit: false, isCompleted: false, isFlexible: false, isGeneral: false,
      frequencyUnit: 'Day', frequencyQuantity: 1, days: [], intervalWeeks: null,
      dueDate: today, scheduledStartDate: today, endDate: null, logs: [] },
  ]
  const vars = { offerFamily: 'missed', accountDate: today, clientContext: { supportsProactiveOffers: true },
    composition: { mode: 'data' }, fixtureEvidence: { habits } }
  return { action, block, habits, vars, output: { composition: { parts: [{ type: 'block', kind: 'habitList', block }] }, trace: { calls: [] } } }
}

it.each(['skip', 'restart'])('accepts a grounded non-daily missed %s occurrence', (family) => {
  const { output, vars } = missedOffer(family, family === 'restart' ? today : '2031-06-08')
  expect(proactiveOffers(output, { vars }).pass).toBe(true)
})

it.each(['absent-target', 'due-today-target', 'unscheduled', 'before-start', 'completed', 'skipped',
  'historical-source', 'missing-schedule', 'missing-history', 'wrong-restart-date'])('binds missed actions to source rows and independent schedule/history: %s', (fault) => {
  const { action, block, habits, output, vars } = missedOffer()
  if (['absent-target', 'due-today-target'].includes(fault)) {
    action.entityId = walkId
    action.date = '2031-06-09'
    if (fault === 'due-today-target') block.items.push({ ...block.items[0], id: walkId, title: 'Walk', status: 'today' })
  }
  if (fault === 'unscheduled') action.date = '2031-06-09'
  if (fault === 'before-start') action.date = '2031-06-05'
  if (fault === 'completed' || fault === 'skipped') habits[0].logs = [{ date: action.date, value: fault === 'completed' ? 1 : 0 }]
  if (fault === 'historical-source') block.date = '2031-06-09'
  if (fault === 'missing-schedule') delete habits[0].frequencyUnit
  if (fault === 'missing-history') delete habits[0].logs
  const family = fault === 'wrong-restart-date' ? 'restart' : 'skip'
  action.offerKey = `${family}:${action.entityId}:${action.date}`
  expect(proactiveOffers(output, { vars }).pass).toBe(false)
})

it('accepts the producer undated skip only for a supported older unresolved occurrence', () => {
  const { action, habits, output, vars } = missedOffer('skip', null)
  Object.assign(habits[0], { frequencyQuantity: 30, dueDate: '2031-05-20', scheduledStartDate: '2031-05-20' })
  expect(proactiveOffers(output, { vars }).pass).toBe(true)
  habits[0].logs.push({ date: '2031-05-20', value: 0 })
  expect(proactiveOffers(output, { vars }).pass).toBe(false)
  habits[0].logs = []
  Object.assign(habits[0], { dueDate: '2031-06-08', scheduledStartDate: '2031-06-08' })
  expect(proactiveOffers(output, { vars }).pass).toBe(false)
  action.date = '2031-06-08'
  action.offerKey += ':2031-06-08'
  expect(proactiveOffers(output, { vars }).pass).toBe(true)
})

it('grounds a one-time skip on its unresolved due date', () => {
  const { habits, output, vars } = missedOffer()
  Object.assign(habits[0], { frequencyUnit: null, frequencyQuantity: null })
  expect(proactiveOffers(output, { vars }).pass).toBe(true)
  habits[0].logs.push({ date: habits[0].dueDate, value: 1 })
  expect(proactiveOffers(output, { vars }).pass).toBe(false)
})

it.each(['daySummary', 'metrics', 'periodInsight', 'unsupported'])('binds missed targets to the producer %s source', (kind) => {
  const { block, output, vars } = missedOffer()
  output.composition.parts[0].kind = kind
  block.rows = block.items
  block.habitId = waterId
  block.needsAttention = [{ habitId: waterId }]
  expect(proactiveOffers(output, { vars }).pass).toBe(kind !== 'unsupported')
  block.rows = []
  block.habitId = walkId
  block.needsAttention = [{ habitId: walkId }]
  expect(proactiveOffers(output, { vars }).pass).toBe(false)
})

it.each([
  ['Week', 1, '2031-06-01', '2031-06-08'],
  ['Month', 1, '2031-01-31', '2031-05-31'],
  ['Year', 1, '2028-02-29', '2031-02-28'],
])('retains supported %s cadence when finding unresolved occurrences', (frequencyUnit, frequencyQuantity, scheduledStartDate, date) => {
  const { action, habits, output, vars } = missedOffer('skip', frequencyUnit === 'Year' ? null : date)
  Object.assign(habits[0], { frequencyUnit, frequencyQuantity, scheduledStartDate, dueDate: date })
  expect(proactiveOffers(output, { vars }).pass).toBe(true)
  action.date = '2031-06-09'
  action.offerKey = `skip:${waterId}:${action.date}`
  expect(proactiveOffers(output, { vars }).pass).toBe(false)
})

it('honors independent weekday, interval-week and inclusive end-date boundaries', () => {
  const { habits, output, vars } = missedOffer()
  Object.assign(habits[0], { frequencyQuantity: 1, days: ['Sunday'], intervalWeeks: 2,
    scheduledStartDate: '2031-05-25', endDate: '2031-06-08' })
  vars.offerWeekStartDay = 1
  expect(proactiveOffers(output, { vars }).pass).toBe(true)
  habits[0].days = ['Monday']
  expect(proactiveOffers(output, { vars }).pass).toBe(false)
  habits[0].days = ['Sunday']
  habits[0].endDate = '2031-06-07'
  expect(proactiveOffers(output, { vars }).pass).toBe(false)
  habits[0].endDate = '2031-06-08'
  delete vars.offerWeekStartDay
  expect(proactiveOffers(output, { vars }).pass).toBe(false)
})
