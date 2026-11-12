import { SHELL_DESTINATION_IDS } from './destination-icons'

export type ShellDestinationId = 'hoje' | 'calendario' | 'progresso' | 'perfil'

export const SHELL_DESTINATION_PATHS = {
  hoje: '/',
  calendario: '/calendar',
  progresso: '/progress',
  perfil: '/profile',
} as const satisfies Record<ShellDestinationId, string>

export type ShellDestinationPath = (typeof SHELL_DESTINATION_PATHS)[ShellDestinationId]

export const SHELL_ROOT_PATHS: readonly string[] = SHELL_DESTINATION_IDS.map((id) => SHELL_DESTINATION_PATHS[id])

export function resolveTabSwitchDirection(from: string, to: string): -1 | 1 | null {
  const fromIndex = SHELL_ROOT_PATHS.indexOf(from)
  const toIndex = SHELL_ROOT_PATHS.indexOf(to)
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return null
  return toIndex > fromIndex ? 1 : -1
}

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
    composer: /^\/habits\/[^/]+$/.test(pathname),
    flow: pathname === '/wrapped' || pathname === '/upgrade' || pathname === '/habits/new',
  }
}

export function resolveShellComposerScope(pathname: string): 'habit' | undefined {
  if (/^\/habits\/[^/]+$/.test(pathname) && pathname !== '/habits/new') return 'habit'
  return undefined
}
