'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { canGoBackInAppHistory } from '@/lib/app-navigation-history'
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

      let hasSameOriginReferrer = false
      if (typeof globalThis.document !== 'undefined' && globalThis.document.referrer) {
        try {
          hasSameOriginReferrer =
            new URL(globalThis.document.referrer).origin === globalThis.location.origin
        } catch {
          hasSameOriginReferrer = false
        }
      }

      if (
        canGoBackInAppHistory() ||
        (globalThis.history.length > 1 && hasSameOriginReferrer)
      ) {
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
