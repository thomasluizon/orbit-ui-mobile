export function connectGoogle(reviewMode: boolean): Promise<void> {
  sessionStorage.setItem('auth_return_url', reviewMode ? '/calendar?mode=review' : '/calendar?import=1')
  globalThis.location.assign('/api/auth/google/start?purpose=calendar')
  return Promise.resolve()
}
