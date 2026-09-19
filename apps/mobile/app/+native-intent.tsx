import { resolveHabitDetailRouteDate } from '@orbit/shared/utils'

const LAUNCH_DESTINATION = '/'
const HABIT_LINK = /^\/habits\/([^/\\]+)$/

function getSystemPathname(path: string): string {
  try {
    const url = new URL(path)
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.pathname
    return url.host ? `/${url.host}${url.pathname}` : url.pathname
  } catch {
    const pathname = path.split(/[?#]/, 1)[0] ?? path
    return pathname.startsWith('/') ? pathname : `/${pathname}`
  }
}

function readHabitId(encodedId: string): string | null {
  try {
    const habitId = decodeURIComponent(encodedId).trim()
    return habitId.length > 0 ? habitId : null
  } catch {
    return null
  }
}

function readDate(path: string): string | null {
  const queryStart = path.indexOf('?')
  if (queryStart < 0) return null
  const query = path.slice(queryStart + 1).split('#', 1)[0] ?? ''
  return new URLSearchParams(query).get('date')
}

/**
 * An Android widget row carries the habit it shows and the day it shows. A row whose habit id
 * or date arrives unusable opens the launch destination, because the wrong habit or the wrong
 * day is a worse landing than Today. Returns null for a path that names no habit.
 */
function resolveHabitLink(path: string, pathname: string): string | null {
  const encodedId = HABIT_LINK.exec(pathname)?.[1]
  if (encodedId === undefined) return null
  if (readHabitId(encodedId) === null) return LAUNCH_DESTINATION
  const date = readDate(path)
  if (date === null) return path
  return resolveHabitDetailRouteDate(date) === date ? path : LAUNCH_DESTINATION
}

export function redirectSystemPath({ path }: Readonly<{
  path: string
  initial: boolean
}>): string {
  const pathname = getSystemPathname(path).replace(/\/+$/, '')
  if (pathname === '/streak' || pathname.startsWith('/streak/')) return '/progress'
  return resolveHabitLink(path, pathname) ?? path
}
