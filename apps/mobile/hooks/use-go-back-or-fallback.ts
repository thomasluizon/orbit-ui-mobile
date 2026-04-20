import { useCallback } from 'react'
import { useRouter, type Href } from 'expo-router'
import { dismissOrFallback } from '@/lib/back-navigation'
import { dismissTopOverlay } from '@/lib/overlay-stack'

interface UseGoBackOrFallbackOptions {
  dismissFirst?: boolean
  replace?: boolean
}

export function useGoBackOrFallback() {
  const router = useRouter()

  return useCallback(
    (fallbackRoute: Href, options: UseGoBackOrFallbackOptions = {}) => {
      const { dismissFirst = true, replace = true } = options

      if (dismissFirst && dismissTopOverlay('navigation')) {
        return
      }

      dismissOrFallback(router, fallbackRoute, { replace })
    },
    [router],
  )
}
