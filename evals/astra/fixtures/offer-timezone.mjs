import { publicApi } from './api.mjs'

export const isBehindState = (vars) => vars.offerFamily === 'goal-behind' && vars.offerState === 'behind'

export function dateInTimeZone(timeZone, instant = new Date()) {
  if (typeof timeZone !== 'string' || !timeZone.trim()) throw new Error('Offer fixture requires a restorable profile timezone.')
  const parts = new Intl.DateTimeFormat('en', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant)
  const value = (type) => parts.find((part) => part.type === type).value
  return `${value('year')}-${value('month')}-${value('day')}`
}

export function goalBehindDates(instant = new Date()) {
  const today = dateInTimeZone('Pacific/Kiritimati', instant)
  const deadlineTimeZone = ['Pacific/Pago_Pago', 'Pacific/Honolulu'].find((zone) =>
    Date.parse(today) - Date.parse(dateInTimeZone(zone, instant)) === 86400000)
  if (!deadlineTimeZone) throw new Error('Goal-behind fixture lacks a one-day timezone transition.')
  return { deadline: dateInTimeZone(deadlineTimeZone, instant), today, deadlineTimeZone }
}

async function setAndVerify(api, timeZone) {
  await api('PUT', 'profile/timezone', { timeZone })
  const { payload } = await api('GET', 'profile')
  if (payload?.timeZone !== timeZone) throw new Error('Profile timezone readback did not match the requested timezone.')
  return dateInTimeZone(payload.timeZone)
}

export async function prepareBehindDeadline(api, vars) {
  const { payload } = await api('GET', 'profile')
  dateInTimeZone(payload?.timeZone)
  const dates = goalBehindDates()
  vars.offerOriginalTimeZone = payload.timeZone
  const deadline = await setAndVerify(api, dates.deadlineTimeZone)
  if (deadline !== dates.deadline) throw new Error('Goal-behind fixture date changed during setup.')
  return deadline
}

export async function advanceBehindDate(api, vars, deadline) {
  const today = await setAndVerify(api, 'Pacific/Kiritimati')
  if (Date.parse(today) - Date.parse(deadline) !== 86400000) throw new Error('Goal-behind fixture is outside its local-date window.')
  vars.accountDate = today
}

export async function restoreOfferTimeZone(vars) {
  if (!Object.hasOwn(vars, 'offerOriginalTimeZone')) return
  await setAndVerify(publicApi(vars.credentialKey), vars.offerOriginalTimeZone)
  delete vars.offerOriginalTimeZone
}
