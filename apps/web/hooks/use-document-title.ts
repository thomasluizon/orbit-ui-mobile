'use client'

import { createContext, useContext, useEffect } from 'react'

export const DocumentTitleContext = createContext<((surface: string) => () => void) | null>(null)

export function useDocumentTitle(surface: string | null, routeKey?: string) {
  const registerTitle = useContext(DocumentTitleContext)
  useEffect(() => {
    if (surface !== null && registerTitle) return registerTitle(surface)
  }, [registerTitle, routeKey, surface])
}
