const PUBLIC_PATHS = [
  '/login',
  '/onboarding',
  '/auth-callback',
  '/r',
  '/terms',
  '/privacy',
  '/about',
  '/delete-account',
  '/turnstile-bridge',
  '/.well-known',
  '/ingest',
]

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (publicPath) => pathname === publicPath || pathname.startsWith(publicPath + '/'),
  )
}
