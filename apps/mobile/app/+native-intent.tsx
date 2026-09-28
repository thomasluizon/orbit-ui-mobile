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

const RETIRED_ROUTE_DESTINATIONS: Readonly<Record<string, string>> = {
  '/streak': '/progress',
  '/preferences': '/profile',
  '/advanced': '/profile',
  '/ai-settings': '/profile',
}

export function redirectSystemPath({ path }: Readonly<{
  path: string
  initial: boolean
}>): string {
  const pathname = getSystemPathname(path).replace(/\/+$/, '')
  const retired = Object.entries(RETIRED_ROUTE_DESTINATIONS).find(([route]) =>
    pathname === route || pathname.startsWith(`${route}/`))
  return retired ? retired[1] : path
}
