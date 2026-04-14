'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { dismissTopOverlay } from '@/lib/overlay-stack'

interface UseGoBackOrFallbackOptions {
  dismissFirst?: boolean
  replace?: boolean
}

export function useGoBackOrFallback() {
  const router = useRouter()

  return useCallback(
    (fallbackRoute: string, options: UseGoBackOrFallbackOptions = {}) => {
      const { dismissFirst = true, replace = true } = options

      if (dismissFirst && dismissTopOverlay('navigation')) {
        return
      }

      if (globalThis.history.length > 1) {
        router.back()
        return
      }

      if (replace) {
        router.replace(fallbackRoute)
        return
      }

      router.push(fallbackRoute)
    },
    [router],
  )
}
