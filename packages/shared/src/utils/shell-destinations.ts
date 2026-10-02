export type ShellDestinationId = 'hoje' | 'calendario' | 'progresso' | 'perfil'

export interface ShellDestinationRoute {
  pattern: string
  destination: ShellDestinationId
}

export const SHELL_DESTINATION_ROUTES: readonly ShellDestinationRoute[] = [
  { pattern: '/', destination: 'hoje' },
  { pattern: '/habit', destination: 'hoje' },
  { pattern: '/habits', destination: 'hoje' },
  { pattern: '/calendar', destination: 'calendario' },
  { pattern: '/progress', destination: 'progresso' },
  { pattern: '/goals', destination: 'progresso' },
  { pattern: '/wrapped', destination: 'progresso' },
  { pattern: '/profile', destination: 'perfil' },
  { pattern: '/notifications', destination: 'hoje' },
  { pattern: '/account', destination: 'perfil' },
  { pattern: '/delete-account', destination: 'perfil' },
  { pattern: '/about', destination: 'perfil' },
  { pattern: '/support', destination: 'perfil' },
  { pattern: '/upgrade', destination: 'perfil' },
  { pattern: '/step-up', destination: 'perfil' },
]

function matchesRoute(pathname: string, pattern: string): boolean {
  if (pattern === '/') return pathname === '/'
  return pathname === pattern || pathname.startsWith(`${pattern}/`)
}

export function resolveShellDestination(pathname: string): ShellDestinationId | null {
  let end = pathname.length
  if (end > 1) {
    while (end > 0 && pathname[end - 1] === '/') end -= 1
  }
  const normalizedPathname = pathname.slice(0, end)
  return SHELL_DESTINATION_ROUTES.find(({ pattern }) =>
    matchesRoute(normalizedPathname, pattern),
  )?.destination ?? null
}

export interface ShellChrome {
  activeId: ShellDestinationId
  composer: boolean
  flow: boolean
}

export function resolveShellChrome(pathname: string, lastDestination: ShellDestinationId = 'hoje'): ShellChrome {
  const destination = resolveShellDestination(pathname)
  return {
    activeId: pathname === '/search' ? lastDestination : destination ?? lastDestination,
    composer: pathname === '/' || /^\/habits\/[^/]+$/.test(pathname),
    flow: pathname === '/wrapped' || pathname === '/upgrade' || pathname === '/habits/new',
  }
}
