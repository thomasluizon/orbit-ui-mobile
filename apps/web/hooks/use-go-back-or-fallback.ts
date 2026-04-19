'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { canGoBackInAppHistory } from '@/lib/app-navigation-history'
import { setRouteTransitionIntent } from '@/lib/motion/route-intent'
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
      const referrer = globalThis.document?.referrer
      if (referrer) {
        try {
          hasSameOriginReferrer =
            new URL(referrer).origin === globalThis.location.origin
        } catch {
          hasSameOriginReferrer = false
        }
      }

      if (
        canGoBackInAppHistory() ||
        (globalThis.history.length > 1 && hasSameOriginReferrer)
      ) {
        setRouteTransitionIntent('back')
        router.back()
        return
      }

      if (replace) {
        setRouteTransitionIntent('replace')
        router.replace(fallbackRoute)
        return
      }

      setRouteTransitionIntent('forward')
      router.push(fallbackRoute)
    },
    [router],
  )
}
