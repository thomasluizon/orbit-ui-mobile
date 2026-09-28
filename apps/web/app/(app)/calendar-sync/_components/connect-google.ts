export function connectGoogle(): Promise<void> {
  sessionStorage.setItem('auth_return_url', '/calendar-sync')
  globalThis.location.assign('/api/auth/google/start?purpose=calendar')
  return Promise.resolve()
}
