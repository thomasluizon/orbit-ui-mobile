'use client'

import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useDocumentTitle } from '@/hooks/use-document-title'
import { resolveTitledRoute, ROUTE_TITLE_KEYS } from '@/lib/route-titles'

export function RouteContext() {
  const route = resolveTitledRoute(usePathname())
  const t = useTranslations()
  useDocumentTitle(route === '/habits/[id]' ? null : t(ROUTE_TITLE_KEYS[route]))
  return null
}
