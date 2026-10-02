'use client'

import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useDocumentTitle } from '@/hooks/use-document-title'
import { useRouteFocus } from '@/hooks/use-route-focus'
import { resolveTitledRoute, ROUTE_TITLE_KEYS } from '@/lib/route-titles'

export function RouteContext() {
  const pathname = usePathname()
  const route = resolveTitledRoute(pathname)
  const t = useTranslations()
  useDocumentTitle(t(ROUTE_TITLE_KEYS[route]), pathname)
  useRouteFocus(pathname)
  return null
}
