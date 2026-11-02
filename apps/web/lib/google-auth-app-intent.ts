type AuthCallbackLocation = Pick<Location, 'search'> & Partial<Pick<Location, 'hash'>>

export function resolveAuthCallbackParams(callback: AuthCallbackLocation): URLSearchParams {
  const params = new URLSearchParams(callback.search)
  const fragment = new URLSearchParams(callback.hash?.replace(/^#/, ''))
  for (const key of ['provider', 'handoff', 'state']) {
    if (!fragment.has(key)) continue
    params.delete(key)
    for (const value of fragment.getAll(key)) params.append(key, value)
  }
  return params
}

export function getGoogleAuthAppIntent({ callback, userAgent, pendingWebState, packageName }: Readonly<{
  callback: Pick<Location, 'protocol' | 'host'> & AuthCallbackLocation
  userAgent: string
  pendingWebState: string | null
  packageName: string | undefined
}>): string | null {
  const params = resolveAuthCallbackParams(callback)
  const state = params.get('state')
  if (!state || state === pendingWebState || (!params.get('code') && !(params.get('provider') === 'apple' && params.get('handoff')) && !params.has('error'))
    || !/Android/i.test(userAgent) || callback.protocol !== 'https:'
    || !packageName || !/^[a-zA-Z][\w]*(?:\.[a-zA-Z][\w]*)+$/.test(packageName)) return null
  return `intent://${callback.host}/auth-callback?${params}#Intent;scheme=https;package=${packageName};end`
}
