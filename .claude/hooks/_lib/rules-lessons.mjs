export function countUnreviewedPendingLessons(markdown) {
  if (typeof markdown !== "string") throw new TypeError("Pending lessons must be text")

  let count = 0
  for (const line of markdown.split(/\r?\n/)) {
    if (/^## Graduated\s*$/.test(line)) break
    if (/^## (\d{4}-\d{2}-\d{2})\b/.test(line)) count++
  }
  return count
}

const DAY_MS = 24 * 60 * 60 * 1000

export function isDriftReviewOverdue(stateJson, today = new Date()) {
  if (stateJson === undefined) return true
  if (stateJson === null) return true
  let state
  try {
    state = JSON.parse(stateJson)
  } catch {
    return true
  }
  if (!state || typeof state.lastRun !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(state.lastRun)) return true
  const lastRun = Date.parse(`${state.lastRun}T00:00:00.000Z`)
  const todayDate = Date.parse(`${today.toISOString().slice(0, 10)}T00:00:00.000Z`)
  if (!Number.isFinite(lastRun) || new Date(lastRun).toISOString().slice(0, 10) !== state.lastRun || lastRun > todayDate) return true
  return todayDate - lastRun > 7 * DAY_MS
}
