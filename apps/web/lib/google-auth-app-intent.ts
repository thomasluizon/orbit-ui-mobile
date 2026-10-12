export function getGoogleAuthAppIntent({ callback, userAgent, pendingWebState, packageName }: Readonly<{
  callback: Pick<Location, 'protocol' | 'host' | 'search'>
  userAgent: string
  pendingWebState: string | null
  packageName: string | undefined
}>): string | null {
  const params = new URLSearchParams(callback.search)
  const state = params.get('state')
  if (!state || state === pendingWebState || (!params.get('code') && !params.has('error'))
    || !/Android/i.test(userAgent) || callback.protocol !== 'https:'
    || !packageName || !/^[a-zA-Z][\w]*(?:\.[a-zA-Z][\w]*)+$/.test(packageName)) return null
  return `intent://${callback.host}/auth-callback${callback.search}#Intent;scheme=https;package=${packageName};end`
}
