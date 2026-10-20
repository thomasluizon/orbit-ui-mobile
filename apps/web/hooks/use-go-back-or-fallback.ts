'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getBackNavigation } from '@/lib/back-navigation'
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

      const navigation = getBackNavigation(fallbackRoute)
      if (navigation.kind === 'history') {
        setRouteTransitionIntent('back')
        router.back()
        return
      }

      if (replace) {
        setRouteTransitionIntent('replace')
        router.replace(navigation.route)
        return
      }

      setRouteTransitionIntent('forward')
      router.push(navigation.route)
    },
    [router],
  )
}
