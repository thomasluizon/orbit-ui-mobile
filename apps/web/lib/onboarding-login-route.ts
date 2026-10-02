export function getOnboardingLoginUrl(query: string, completed = false): string {
  const params = new URLSearchParams(query)
  if (completed) params.set('from', 'onboarding')
  const loginQuery = params.toString()
  return loginQuery ? `/login?${loginQuery}` : '/login'
}
