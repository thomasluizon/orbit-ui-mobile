'use client'

import { useEffect } from 'react'
import { formatRouteTitle } from '@/lib/route-titles'

export function useDocumentTitle(surface: string | null) {
  useEffect(() => {
    if (surface !== null) document.title = formatRouteTitle(surface)
  }, [surface])
}
