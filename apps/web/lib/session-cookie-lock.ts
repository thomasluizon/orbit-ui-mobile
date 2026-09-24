const SESSION_COOKIE_LOCK = 'orbit-session-cookies'

export async function withSessionCookieLock<T>(task: () => Promise<T>): Promise<T> {
  if (typeof navigator === 'undefined' || !('locks' in navigator)) {
    throw new Error('Web Locks API is required for session cookie changes')
  }

  return navigator.locks.request(SESSION_COOKIE_LOCK, task)
}
