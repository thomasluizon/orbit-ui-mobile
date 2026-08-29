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
  { pattern: '/calendar-sync', destination: 'calendario' },
  { pattern: '/progress', destination: 'progresso' },
  { pattern: '/goals', destination: 'progresso' },
  { pattern: '/streak', destination: 'progresso' },
  { pattern: '/retrospective', destination: 'progresso' },
  { pattern: '/wrapped', destination: 'progresso' },
  { pattern: '/profile', destination: 'perfil' },
  { pattern: '/achievements', destination: 'progresso' },
  { pattern: '/preferences', destination: 'perfil' },
  { pattern: '/advanced', destination: 'perfil' },
  { pattern: '/ai-settings', destination: 'perfil' },
  { pattern: '/notifications', destination: 'perfil' },
  { pattern: '/account', destination: 'perfil' },
  { pattern: '/delete-account', destination: 'perfil' },
  { pattern: '/about', destination: 'perfil' },
  { pattern: '/support', destination: 'perfil' },
  { pattern: '/step-up', destination: 'perfil' },
]

function matchesRoute(pathname: string, pattern: string): boolean {
  if (pattern === '/') return pathname === '/'
  return pathname === pattern || pathname.startsWith(`${pattern}/`)
}

export function resolveShellDestination(pathname: string): ShellDestinationId | null {
  const normalizedPathname = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  return SHELL_DESTINATION_ROUTES.find(({ pattern }) =>
    matchesRoute(normalizedPathname, pattern),
  )?.destination ?? null
}
