import type { Href } from 'expo-router'
import { getUpgradeFallbackRoute } from '@/lib/upgrade-route'

interface BackNavigationOptions {
  isAuthenticated?: boolean
  upgradeFrom?: string | string[]
}

interface DismissibleRouter {
  canDismiss: () => boolean
  dismiss: (count?: number) => void
  dismissTo: (href: Href) => void
  push: (href: Href) => void
}

export function dismissOrFallback(
  router: DismissibleRouter,
  fallbackRoute: Href,
  options: { replace?: boolean } = {},
): void {
  const { replace = true } = options

  if (router.canDismiss()) {
    router.dismiss()
    return
  }

  if (replace) {
    router.dismissTo(fallbackRoute)
    return
  }

  router.push(fallbackRoute)
}

export function getAndroidBackFallbackRoute(
  pathname: string | null | undefined,
  options: BackNavigationOptions = {},
): Href | null {
  const currentPath = pathname ?? ''

  switch (currentPath) {
    case '/':
      return null
    case '/calendar':
    case '/chat':
    case '/profile':
      return '/'
    case '/about':
    case '/achievements':
    case '/advanced':
    case '/ai-settings':
    case '/calendar-sync':
    case '/preferences':
    case '/retrospective':
    case '/streak':
    case '/support':
      return '/profile'
    case '/privacy':
      return options.isAuthenticated ? '/' : '/login'
    case '/upgrade':
      return getUpgradeFallbackRoute(options.upgradeFrom, '/profile')
    default:
      return null
  }
}
