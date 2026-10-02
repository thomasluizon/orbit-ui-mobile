import { LEGACY_PROFILE_ROUTES, getProfileSectionDestination } from '@orbit/shared/utils/profile-routes'

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
  ...Object.fromEntries(LEGACY_PROFILE_ROUTES.map(({ source, destination }) => [source, destination])),
}

export function redirectSystemPath({ path }: Readonly<{
  path: string
  initial: boolean
}>): string {
  const pathname = getSystemPathname(path).replace(/\/+$/, '')
  const retired = Object.entries(RETIRED_ROUTE_DESTINATIONS).find(([route]) =>
    pathname === route || pathname.startsWith(`${route}/`))
  if (retired) return retired[1]
  if (pathname === '/profile') {
    const suffixIndex = path.search(/[?#]/)
    const suffix = suffixIndex < 0 ? '' : path.slice(suffixIndex)
    const hashIndex = suffix.indexOf('#')
    const search = suffix.startsWith('?') ? suffix.slice(0, hashIndex < 0 ? undefined : hashIndex) : ''
    const hash = hashIndex < 0 ? '' : suffix.slice(hashIndex)
    return getProfileSectionDestination(search, hash) ?? path
  }
  return path
}
