'use client'

import { useCallback, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { DocumentTitleContext } from '@/hooks/use-document-title'
import { useRouteFocus } from '@/hooks/use-route-focus'
import { formatRouteTitle, resolveTitledRoute, ROUTE_TITLE_KEYS, SERVER_TITLED_ROUTES } from '@/lib/route-titles'

export function RouteContext({ children }: Readonly<{ children?: ReactNode }>) {
  const pathname = usePathname()
  const route = resolveTitledRoute(pathname)
  const t = useTranslations()
  const [override, setOverride] = useState<{ pathname: string; surface: string; owner: symbol } | null>(null)
  const registerTitle = useCallback((surface: string) => {
    const owner = Symbol()
    setOverride({ pathname, surface, owner })
    return () => setOverride((current) => current?.owner === owner ? null : current)
  }, [pathname])
  const surface = override?.pathname === pathname ? override.surface : t(ROUTE_TITLE_KEYS[route])
  useRouteFocus(pathname)
  return <DocumentTitleContext value={registerTitle}>
    {!SERVER_TITLED_ROUTES.includes(route) && <title>{formatRouteTitle(surface)}</title>}
    {children}
  </DocumentTitleContext>
}
