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

export function redirectSystemPath({ path }: Readonly<{
  path: string
  initial: boolean
}>): string {
  const pathname = getSystemPathname(path).replace(/\/+$/, '')
  return pathname === '/streak' || pathname.startsWith('/streak/')
    ? '/progress'
    : path
}
