import { useCallback } from 'react'
import { useRouter, type Href } from 'expo-router'
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

      if (router.canGoBack()) {
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
