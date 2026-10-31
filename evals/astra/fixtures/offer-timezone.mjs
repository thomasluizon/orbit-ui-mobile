import { publicApi } from './api.mjs'

export const isBehindVariant = (vars) => vars.offerFamily === 'goal-behind' && vars.offerVariant === 1

export function dateInTimeZone(timeZone, instant = new Date()) {
  if (typeof timeZone !== 'string' || !timeZone.trim()) throw new Error('Offer fixture requires a restorable profile timezone.')
  const parts = new Intl.DateTimeFormat('en', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant)
  const value = (type) => parts.find((part) => part.type === type).value
  return `${value('year')}-${value('month')}-${value('day')}`
}

export function goalBehindDates(instant = new Date()) {
  const deadline = dateInTimeZone('Pacific/Pago_Pago', instant)
  const today = dateInTimeZone('Pacific/Kiritimati', instant)
  if (Date.parse(today) - Date.parse(deadline) !== 86400000) throw new Error('Goal-behind fixture is outside its local-date window.')
  return { deadline, today }
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
  goalBehindDates()
  vars.offerOriginalTimeZone = payload.timeZone
  return setAndVerify(api, 'Pacific/Pago_Pago')
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
