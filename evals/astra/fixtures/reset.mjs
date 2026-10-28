#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { parse } from 'yaml'
import { apiOrigin, readCredentials, refreshCredential, safeFailureMessage, updateCredentials } from '../credentials.mjs'
import { publicApi, requireEvalAccess } from './api.mjs'
import { fixtureNames, fixtureHabitTitles, habitlessFixtures, maliciousHabitTitle, startingChecklistItems } from './names.mjs'
import { exhaustAllowance } from './allowance.mjs'

const corpus = ['scenarios.yaml', 'composition-scenarios.yaml'].flatMap((path) =>
  parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')))
const fixtures = new Set(['pro', 'duplicate-titles', 'malicious-title', 'zero-history', 'empty', 'overdue', 'skipped',
  'free-at-limit', 'budget-exhausted', 'composition', 'composition-partial', 'composition-stale', 'composition-error',
  'composition-offline', 'composition-logged', 'medical', 'existing-parents', 'starting-step-checklist'])
export const disposableStagingOrigin = 'https://orbit-api-staging-uqu2.onrender.com'
export function requireStagingOrigin() {
  if (apiOrigin() !== disposableStagingOrigin) throw new Error('Fixture isolation requires the disposable staging origin.')
}

export async function clearPendingOperations(api) {
  for (const [method, field] of [['DELETE', 'cancelledCount'], ['GET', 'pendingCount']]) {
    let response
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await api(method, 'eval/pending-operations', undefined, [], [409])
      if (response.status !== 409) break
    }
    if (response.status !== 200) throw new Error(`Pending isolation ${method} failed with HTTP ${response.status}.`)
    const count = response.payload?.[field]
    if (!Number.isInteger(count) || count < 0 || (method === 'GET' && count !== 0)) {
      throw new Error(`Pending isolation ${method} requires ${field} ${method === 'GET' ? 'equal to zero' : 'as a nonnegative integer'}.`)
    }
  }
}

export const dateOffset = (today, offset) => new Date(Date.parse(`${today}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10)

function dailyHabit(title, dueDate) {
  return { title, description: null, frequencyUnit: 'Day', frequencyQuantity: 1, dueDate,
    days: [], isBadHabit: false, isGeneral: false, isFlexible: false,
    reminderEnabled: false, reminderTimes: [], scheduledReminders: [], relativeReminders: [], slipAlertEnabled: false,
    checklistItems: [], tagIds: [], goalIds: [] }
}
async function snapshot(api) {
  const { payload } = await api('GET', 'profile/export')
  for (const field of ['habits', 'goals', 'tags', 'checklistTemplates']) {
    if (!Array.isArray(payload?.[field])) throw new Error('Fixture export is missing a required collection.')
  }
  return payload
}
async function remember(key, field, value) {
  await updateCredentials((credentials) => { credentials[key][field] = value })
}
function idFrom(payload) {
  if (typeof payload?.id !== 'string' || !/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(payload.id)) {
    throw new Error('Fixture creation did not return a UUID.')
  }
  return payload.id
}
async function stableHabits(api, key, exported, today, names) {
  const account = readCredentials()[key]
  for (const [field, title, environmentKey] of [
    ['habitId', names.habits[0], 'ORBIT_EVAL_HABIT_ID'], ['secondHabitId', names.habits[1], 'ORBIT_EVAL_SECOND_HABIT_ID'],
  ]) {
    const configured = key === 'ORBIT_EVAL_TOKEN' ? process.env[environmentKey] : undefined
    if (configured && account[field] && configured !== account[field]) throw new Error('Configured habit ID disagrees with the private fixture registry.')
    const position = field === 'habitId' ? 0 : 1
    const titles = ['en', 'pt-BR'].map((locale) => fixtureNames(locale).habits[position])
    let id = account[field] ?? configured ?? exported.habits.find((habit) => titles.includes(habit.title))?.id
    if (!id) id = idFrom((await api('POST', 'habits', dailyHabit(title, dateOffset(today, -6)))).payload)
    else if (!exported.habits.some((habit) => habit.id === id)) await api('POST', `habits/${id}/restore`)
    await remember(key, field, id)
    account[field] = id
  }
  return account
}
async function cleanCollections(api, exported, keep) {
  for (const habit of exported.habits) {
    if (!keep.includes(habit.id)) await api('DELETE', `habits/${habit.id}`, undefined, ['HABIT_NOT_FOUND'])
  }
  for (const [field, path] of [['goals', 'goals'], ['tags', 'tags'], ['checklistTemplates', 'checklist-templates']]) {
    for (const item of exported[field]) await api('DELETE', `${path}/${item.id}`)
  }
}
async function restoreHabits(api, exported, account, fixture, today, titles) {
  for (const [id, title] of [[account.habitId, titles[0]], [account.secondHabitId, titles[1]]]) {
    const start = fixture === 'overdue' ? process.env.ORBIT_EVAL_OVERDUE_DATE
      : fixture.startsWith('composition') ? dateOffset(today, -6) : today
    await api('PUT', `habits/${id}`, { ...dailyHabit(title, start), clearEndDate: true, clearParent: true })
    const history = exported.habits.find((habit) => habit.id === id)?.logs
    if (!Array.isArray(history)) throw new Error('Fixture export lacks stable habit history.')
    const completed = history.filter((log) => log.value > 0)
    if (completed.some((log) => log.date < dateOffset(today, -7))) throw new Error('Positive history outside the public undo window needs a new corpus window; stable IDs cannot be recreated.')
    for (const log of completed) await api('POST', `habits/${id}/log`, { date: log.date })
    await api('PUT', `habits/${id}`, { ...dailyHabit(title, start), clearEndDate: true, clearParent: true })
  }
}
async function seedComposition(api, account, today, fixture, names) {
  for (const [id, title, offsets] of [[account.habitId, names.habits[0], [-6, -4, -3, -2, -1]], [account.secondHabitId, names.habits[1], [-5, -2]]]) {
    for (const offset of offsets) await api('POST', `habits/${id}/log`, { date: dateOffset(today, offset) })
    await api('PUT', `habits/${id}`, dailyHabit(title, today))
  }
  const tag = idFrom((await api('POST', 'tags', { name: names.tag, color: '#22c55e' })).payload)
  await api('PUT', `tags/${account.habitId}/assign`, { tagIds: [tag] })
  await api('POST', 'checklist-templates', { name: names.template, items: names.checklist })
  await api('POST', 'goals', { title: names.goal, description: null, targetValue: 10, unit: names.unit, type: 'Standard', habitIds: [account.habitId] })
  await api('PUT', 'calendar/selected-calendars', { calendarIds: [] })
  await api('PUT', 'calendar/auto-sync', { enabled: false })
  if (fixture === 'composition-logged') await api('POST', `habits/${account.habitId}/log`, { date: today })
}
async function seedStaleRetrospective(api, today, locale) {
  const path = `habits/retrospective?period=month&language=${encodeURIComponent(locale)}`
  await api('GET', path)
  const { payload } = await api('GET', path)
  const narrative = payload?.narrative
  if (payload?.fromCache !== true || payload.period !== 'month'
    || payload.dateFrom !== dateOffset(today, -29) || payload.dateTo !== today
    || !narrative || !['highlights', 'missed', 'trends', 'suggestion'].every((field) => typeof narrative[field] === 'string')
    || !Object.values(narrative).some((section) => typeof section === 'string' && section.trim())) {
    throw new Error('Stale fixture could not verify a cached month retrospective narrative for the account dates.')
  }
  return payload
}
async function fillCapacity(api, today) {
  let batchSize = 100
  let count = 0
  while (batchSize > 0) {
    const response = await api('POST', 'habits/bulk', { habits: Array.from({ length: batchSize }, (_, index) => ({ title: `Capacity ${count + index + 1}`, description: null, frequencyUnit: 'Day', frequencyQuantity: 1, dueDate: today })) }, ['HABIT_LIMIT_REACHED'])
    if (response.payload?.errorCode === 'HABIT_LIMIT_REACHED') { batchSize = Math.floor(batchSize / 2); continue }
    if (!Array.isArray(response.payload?.results) || response.payload.results.length !== batchSize
      || response.payload.results.some((item) => item.status !== 'Success' || !item.habitId)) throw new Error('Capacity fixture bulk creation was partial or malformed.')
    count += batchSize
    if (count >= 10000) throw new Error('Capacity fixture exceeded its bounded provisioning limit.')
  }
}

async function verifyFixture(api, account, fixture, today, names) {
  const restored = await snapshot(api)
  const water = restored.habits.find((habit) => habit.id === account.habitId)
  const walk = restored.habits.find((habit) => habit.id === account.secondHabitId)
  if (!water || !walk) throw new Error('Fixture readback lost a stable habit.')
  if (water.title !== names[0] || walk.title !== names[1]) throw new Error('Fixture title readback failed.')
  const expectedCount = fixture === 'composition-partial' ? 51 : fixture === 'malicious-title' ? 3 : 2
  if (fixture !== 'free-at-limit' && restored.habits.length !== expectedCount) throw new Error('Fixture habit count readback failed.')
  if (fixture.startsWith('composition')) {
    for (const [habit, offsets] of [[water, [-6, -4, -3, -2, -1, ...(fixture === 'composition-logged' ? [0] : [])]], [walk, [-5, -2]]]) {
      const dates = habit.logs.filter((log) => log.value > 0).map((log) => log.date).sort()
      const expected = offsets.map((offset) => dateOffset(today, offset)).sort()
      if (JSON.stringify(dates) !== JSON.stringify(expected)) throw new Error('Composition fixture history readback failed.')
    }
    if (restored.goals.length !== 1
      || restored.tags.length !== 1 || restored.checklistTemplates.length !== 1) throw new Error('Composition fixture readback failed.')
  } else if ([water, walk].some((habit) => habit.logs.some((log) => log.value > 0))) throw new Error('Pending fixture retains positive history.')
  for (const habit of [water, walk]) {
    const advanced = (fixture === 'skipped' && habit === walk) || (fixture === 'composition-logged' && habit === water)
    const expected = fixture === 'overdue' ? process.env.ORBIT_EVAL_OVERDUE_DATE : dateOffset(today, advanced ? 1 : 0)
    if (habit.dueDate !== expected) throw new Error('Fixture occurrence readback failed.')
  }
}

export async function resetFixture(test, today = new Date().toISOString().slice(0, 10), unmetered = false,
  requireFreshFreeWindow = test.vars.preconditions?.freshFreeDailyWindow === true) {
  requireStagingOrigin()
  const fixture = test.metadata.fixture
  const names = fixtureNames(test.metadata.locale)
  const titles = fixtureHabitTitles(fixture, test.metadata.locale)
  if (!fixtures.has(fixture)) throw new Error('Unknown fixture.')
  const key = test.vars.credentialKey
  const api = publicApi(key)
  try { await clearPendingOperations(api) } catch (error) {
    throw new Error(`Pending isolation unavailable. ${safeFailureMessage(error)}`)
  }
  const { payload: profile } = await api('GET', 'profile')
  if (typeof profile?.email !== 'string' || !/^thomaslrgregorio\+orbit-eval-[a-z0-9-]+@gmail\.com$/.test(profile.email)) {
    throw new Error('Fixture reset requires the staging origin and a disposable eval account.')
  }
  if (typeof profile?.hasProAccess !== 'boolean' || !Number.isInteger(profile.aiMessagesUsed) || !Number.isInteger(profile.aiMessagesLimit)) throw new Error('Fixture profile lacks access or allowance evidence.')
  if (requireFreshFreeWindow && (profile.hasProAccess || profile.aiMessagesUsed !== 0)) {
    throw new Error('Fixture needs a fresh Free daily window with zero Astra messages used.')
  }
  await api('PUT', 'profile/timezone', { timeZone: 'UTC' })
  await api('PUT', 'profile/language', { language: test.metadata.locale ?? 'en' })
  if (fixture === 'budget-exhausted') {
    await exhaustAllowance(api, profile, test.metadata.locale)
    return
  }
  if ((fixture === 'free-at-limit') === profile.hasProAccess) throw new Error('Fixture account has the wrong plan access.')
  if (!unmetered && profile.aiMessagesUsed >= profile.aiMessagesLimit) {
    throw new Error(test.vars.preconditions?.freshFreeDailyWindow
      ? 'Fixture needs a fresh Free daily window; its Astra allowance is exhausted.'
      : 'Fixture daily allowance is exhausted; resume in another daily window.')
  }
  if (fixture.startsWith('composition') && profile.hasGoogleConnection !== false) throw new Error('Composition fixtures require a disconnected disposable calendar account.')
  if (fixture === 'overdue') {
    const overdue = process.env.ORBIT_EVAL_OVERDUE_DATE ?? dateOffset(today, -1)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(overdue) || overdue < dateOffset(today, -7) || overdue >= today) throw new Error('Overdue date must be within the public log window and before today.')
    process.env.ORBIT_EVAL_OVERDUE_DATE = overdue
  }
  if (fixture.startsWith('composition')) {
    await api('DELETE', 'notifications/all')
    const { payload: notifications } = await api('GET', 'notifications')
    if (!Array.isArray(notifications?.items) || notifications.items.length) throw new Error('Notification fixture clear failed independent readback.')
  }
  let exported = await snapshot(api)
  const account = await stableHabits(api, key, exported, today, names)
  exported = await snapshot(api)
  const empty = habitlessFixtures.includes(fixture)
  await cleanCollections(api, fixture === 'free-at-limit' ? { ...exported, habits: [] } : exported, empty ? [] : [account.habitId, account.secondHabitId])
  if (empty) {
    if ((await snapshot(api)).habits.length) throw new Error('Empty fixture readback still contains habits.')
    return
  }
  await restoreHabits(api, exported, account, fixture, today, titles)
  if (fixture === 'starting-step-checklist') {
    const checklistItems = startingChecklistItems(test.metadata.locale)
    await api('PUT', `habits/${account.habitId}/checklist`, { checklistItems })
    const stored = (await snapshot(api)).habits.find((habit) => habit.id === account.habitId)
    if (JSON.stringify(stored?.checklistItems) !== JSON.stringify(checklistItems)) throw new Error('Starting checklist fixture readback failed.')
  }
  if (fixture === 'skipped') await api('POST', `habits/${account.secondHabitId}/skip`, { date: today })
  if (fixture === 'malicious-title') await api('POST', 'habits', dailyHabit(maliciousHabitTitle, today))
  if (fixture.startsWith('composition')) await seedComposition(api, account, today, fixture, names)
  if (fixture === 'composition-partial') {
    for (const title of titles.slice(2)) await api('POST', 'habits', dailyHabit(title, today))
  }
  if (fixture === 'free-at-limit') await fillCapacity(api, today)
  await verifyFixture(api, account, fixture, today, titles)
  if (fixture === 'composition-stale') return seedStaleRetrospective(api, today, test.metadata.locale ?? 'en')
}

export async function runReset(caseId) {
  const test = corpus.find((entry) => entry.metadata.id === caseId)
  if (!test) throw new Error('Unknown corpus case ID.')
  requireStagingOrigin()
  await refreshCredential(test.vars.credentialKey)
  const unmetered = await requireEvalAccess(test.vars.credentialKey)
  await resetFixture(test, undefined, unmetered)
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await runReset(process.argv[2]) } catch (error) {
    process.stderr.write(`Astra fixture reset failed; no chat request was sent. ${safeFailureMessage(error)}\n`)
    process.exitCode = 1
  }
}
