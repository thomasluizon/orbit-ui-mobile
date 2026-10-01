export interface HabitCreateRouteInput {
  title?: string
  date?: string | null
  from?: string
  conversation?: boolean
  recoveryId?: string
}

export function buildHabitCreateHref(input: HabitCreateRouteInput = {}): string {
  const params = new URLSearchParams()
  if (input.title) params.set('title', input.title)
  if (input.date) params.set('date', input.date)
  if (input.from) params.set('from', input.from)
  if (input.conversation) params.set('origin', 'conversation')
  if (input.recoveryId) params.set('recovery', input.recoveryId)
  const query = params.toString()
  return `/habits/new${query ? `?${query}` : ''}`
}

export function resolveHabitCreateReturnPath(from: string | undefined): string {
  if (!from || !from.startsWith('/') || from.startsWith('//') || from.includes('\\') || /[\u0000-\u0020\u007f]/.test(from)) return '/'
  const path = from.split(/[?#]/)[0]
  return path.replace(/\/+$/, '') === '/habits/new' ? '/' : from
}
