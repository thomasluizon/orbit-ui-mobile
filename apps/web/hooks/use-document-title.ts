'use client'

import { useEffect } from 'react'
import { useLocale } from 'next-intl'
import { formatRouteTitle } from '@/lib/route-titles'

export function useDocumentTitle(surface: string | null, routeKey?: string) {
  const locale = useLocale()
  useEffect(() => {
    if (surface !== null) document.title = formatRouteTitle(surface)
  }, [locale, routeKey, surface])
}
