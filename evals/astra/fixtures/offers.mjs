import { isDeepStrictEqual } from 'node:util'
import { publicApi } from './api.mjs'
import { fixtureNames } from './names.mjs'
import { advanceBehindDate, isBehindState, prepareBehindDeadline, restoreOfferTimeZone } from './offer-timezone.mjs'
import { readCredentials } from '../credentials.mjs'

const offset = (date, days) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10)
const collections = ['habits', 'goals', 'tags', 'checklistTemplates']
// Omit unchanged startDate so dueDate edits move the occurrence and preserve the stored recurrence anchor.
const habitRequestFields = ['title', 'description', 'frequencyUnit', 'frequencyQuantity', 'days', 'isBadHabit',
  'dueDate', 'dueTime', 'dueEndTime', 'reminderEnabled', 'reminderTimes', 'scheduledReminders',
  'slipAlertEnabled', 'checklistItems', 'isGeneral', 'endDate', 'isFlexible', 'goalIds', 'emoji',
  'intervalWeeks', 'relativeReminders', 'tagIds', 'repeatReminder']

function withoutReminderClock(habit) {
  const { nextReminderAtUtc: _nextReminderAtUtc, children, ...fields } = habit
  return { ...fields, ...(Array.isArray(children) ? { children: children.map(withoutReminderClock) } : {}) }
}

export async function readOfferState(api) {
  const { payload } = await api('GET', 'profile/export')
  if (!collections.every((field) => Array.isArray(payload?.[field]))) throw new Error('Offer readback lacks account collections.')
  const snapshot = Object.fromEntries(collections.map((field) => [field, payload[field].toSorted((left, right) => left.id.localeCompare(right.id))]))
  for (const [index, habit] of snapshot.habits.entries()) {
    const { payload: detail } = await api('GET', `habits/${habit.id}`)
    if (detail?.id !== habit.id) throw new Error('Offer detail readback identity mismatch.')
    snapshot.habits[index] = { ...withoutReminderClock(detail), ...habit }
  }
  return snapshot
}

async function changeHabit(api, id, edits) {
  const { payload: habit } = await api('GET', `habits/${id}`)
  if (habit?.id !== id) throw new Error('Offer fixture habit identity mismatch.')
  const current = Object.fromEntries(habitRequestFields.filter((field) => Object.hasOwn(habit, field))
    .map((field) => [field, habit[field]]))
  await api('PUT', `habits/${id}`, { ...current, ...edits })
  const { payload: restored } = await api('GET', `habits/${id}`)
  if (!Object.entries(edits).every(([field, value]) => isDeepStrictEqual(restored?.[field], value))) throw new Error('Offer fixture habit field readback failed.')
}

async function seedGoalState(api, vars, baseline, today) {
  const goal = baseline.goals[0]
  if (!goal) throw new Error('Offer goal fixture requires an owned goal.')
  const family = vars.offerFamily
  const state = vars.offerState
  const deadline = isBehindState(vars) ? await prepareBehindDeadline(api, vars) : family === 'goal-behind' ? offset(today, 3)
    : state === 'no_deadline' ? null : offset(today, 30)
  const edits = { title: goal.title, description: goal.description, targetValue: 1000, unit: goal.unit, deadline }
  await api('PUT', `goals/${goal.id}`, edits)
  if (isBehindState(vars)) await advanceBehindDate(api, vars, deadline)
  if (family === 'goal-on-track' && state === 'completed') await api('PUT', `goals/${goal.id}/status`, { status: 'Completed' })
  const { payload: page } = await api('GET', 'goals')
  if (!Array.isArray(page?.items) || page.totalPages !== 1) throw new Error('Offer goal tracking requires a complete goal list.')
  const payload = page.items.find((candidate) => candidate.id === goal.id)
  if (payload?.id !== goal.id || payload.trackingStatus !== state || payload.deadline !== deadline || payload.targetValue !== 1000) throw new Error('Offer goal tracking readback failed.')
  vars.offerGoalTracking = payload.trackingStatus
}

async function seedResolved(api, baseline, today) {
  const [water, walk] = baseline.habits
  if (!water || !walk) throw new Error('Resolved offer fixture requires two owned habits.')
  await api('POST', `habits/${water.id}/log`, { date: today })
  await api('POST', `habits/${walk.id}/skip`, { date: today })
  await changeHabit(api, walk.id, { isBadHabit: true })
  const restored = await readOfferState(api)
  if (!restored.habits.find((habit) => habit.id === water.id)?.logs.some((log) => log.date === today && log.value > 0)
    || restored.habits.find((habit) => habit.id === walk.id)?.dueDate <= today) throw new Error('Resolved offer occurrence readback failed.')
}

async function seedStored(api, baseline, names, vars) {
  const habitId = readCredentials()[vars.credentialKey]?.habitId ?? process.env.ORBIT_EVAL_HABIT_ID
  const habit = baseline.habits.find((candidate) => candidate.id === habitId)
  if (!habit) throw new Error('Stored offer fixture requires its registered rename target.')
  const { payload: tag } = await api('POST', 'tags', { name: names.tag, color: '#22c55e' })
  if (typeof tag?.id !== 'string') throw new Error('Stored offer fixture lacks its tag identity.')
  await api('PUT', `tags/${habit.id}/assign`, { tagIds: [tag.id] })
  await changeHabit(api, habit.id, { emoji: '💧', reminderEnabled: true, reminderTimes: [30],
    checklistItems: [{ text: names.checklist[0], isChecked: true }] })
  const { payload: restored } = await api('GET', `habits/${habit.id}`)
  if (!Array.isArray(restored?.tags) || restored.tags.length !== 1 || restored.tags[0].id !== tag.id) {
    throw new Error('Stored offer fixture tag readback failed on the rename target.')
  }
}

export async function seedOfferFixture(test, today) {
  try { await seedOfferState(test, today) } catch (error) {
    await restoreOfferTimeZone(test.vars)
    throw error
  }
}

async function seedOfferState(test, today) {
  const vars = test.vars
  if (!vars.offerFamily) return
  const api = publicApi(vars.credentialKey)
  const baseline = await readOfferState(api)
  const names = fixtureNames(test.metadata.locale)
  if (vars.offerFamily === 'missed') {
    const { payload: profile } = await api('GET', 'profile')
    if (!Number.isInteger(profile?.weekStartDay) || profile.weekStartDay < 0 || profile.weekStartDay > 6) throw new Error('Missed offer fixture lacks the account week start.')
    vars.offerWeekStartDay = profile.weekStartDay
  }
  if (['goal-behind', 'goal-on-track'].includes(vars.offerFamily)) await seedGoalState(api, vars, baseline, today)
  if (isBehindState(vars)) today = vars.accountDate
  if (vars.offerFamily === 'resolved') await seedResolved(api, baseline, today)
  if (vars.offerFamily === 'stored') await seedStored(api, baseline, names, vars)
  if (vars.offerFamily === 'reminder-gap') {
    const enabled = vars.offerState === 'reminders_on'
    for (const habit of baseline.habits) await changeHabit(api, habit.id, { reminderEnabled: enabled,
      dueDate: offset(today, -6), reminderTimes: enabled ? [30] : [] })
    if (enabled) vars.offerExclusion = ['reminder']
  }
  if (vars.offerFamily === 'goal-gap' && vars.offerState === 'equivalent_goal') {
    await api('POST', 'goals', { title: test.metadata.locale === 'pt-BR' ? 'Correr cinco quilômetros' : 'Run five kilometers',
      description: null, targetValue: 5, unit: 'km', type: 'Standard', habitIds: [] })
    vars.offerExclusion = ['aim']
  }
  if (vars.offerFamily === 'goal-link') {
    const goal = baseline.goals[0]
    await api('PUT', `goals/${goal.id}`, { title: test.metadata.locale === 'pt-BR' ? 'Mobilidade diária' : 'Daily mobility',
      description: null, targetValue: 10, unit: names.unit, deadline: offset(today, 30) })
  }
  if (vars.offerFamily === 'calendar-gap') {
    const { payload: profile } = await api('GET', 'profile')
    const { payload: config } = await api('GET', 'config')
    if (typeof profile?.hasGoogleConnection !== 'boolean' || typeof config?.features?.calendar_integration?.enabled !== 'boolean') throw new Error('Calendar offer availability lacks readback.')
    if (profile.hasGoogleConnection || !config.features.calendar_integration.enabled) vars.offerExclusion = ['calendar']
  }
  vars.offerBaseline = await readOfferState(api)
  vars.fixtureEvidence = { ...vars.fixtureEvidence, ...vars.offerBaseline }
  vars.offerStartDate = offset(today, 1)
  vars.offerEndDate = offset(today, 7)
  vars.offerRequireReadback = true
}
