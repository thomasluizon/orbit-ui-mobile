import { useEffect, useRef, useCallback } from 'react'
import { Dimensions, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePathname, useRouter } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { profileKeys } from '@orbit/shared/query'
import type { Profile } from '@orbit/shared/types'
import { useTourStore } from '@/stores/tour-store'
import { useUIStore } from '@/stores/ui-store'
import { useTourMockData } from '@/hooks/use-tour-mock-data'
import { useProfile } from '@/hooks/use-profile'
import { tourTargetRegistry, tourScrollRegistry } from './tour-target-context'
import { API } from '@orbit/shared/api'
import { apiClient } from '@/lib/api-client'
import AsyncStorage from '@react-native-async-storage/async-storage'

const TARGET_FIND_TIMEOUT = 5000
const SCROLL_SETTLE_DELAY = 400
const MEASURE_POLL_INTERVAL = 200
const RE_MEASURE_INTERVAL = 500

/**
 * Tour orchestrator: handles navigation, element detection, scroll-into-view,
 * mock data, and cleanup.
 * Mirrors the web TourProvider: global registry, scroll into view, continuous re-measurement.
 */
export function TourProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const queryClient = useQueryClient()
  const insets = useSafeAreaInsets()
  const { inject, restore } = useTourMockData()
  const { profile } = useProfile()
  const hasProAccess = profile?.hasProAccess ?? false

  const store = useTourStore()
  const { isActive, getCurrentStep, setTargetRect, setNavigating, endTour, nextStep, setHiddenSections } = store

  const prevStepIdRef = useRef<string | null>(null)
  const mockDataInjectedRef = useRef(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const reMeasureRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    setHiddenSections(hasProAccess ? [] : ['goals'])
  }, [hasProAccess, setHiddenSections])

  // On Android with translucent status bar, measureInWindow returns Y from
  // the top of the screen (behind status bar), but the overlay SVG starts
  // below the status bar. We need to subtract the status bar height.
  // The spotlight appearing ABOVE the element means Y is too small,
  // so we need to ADD the offset to push the spotlight down.
  const yAdjust = Platform.OS === 'android' ? insets.top : 0

  // Inject mock data when tour starts
  useEffect(() => {
    if (isActive && !mockDataInjectedRef.current) {
      useUIStore.getState().setActiveView('today')
      inject()
      mockDataInjectedRef.current = true
    }
    if (!isActive && mockDataInjectedRef.current) {
      restore()
      mockDataInjectedRef.current = false
    }
  }, [isActive, inject, restore])

  // Handle tour end
  const handleEndTour = useCallback(async () => {
    endTour()

    try {
      await apiClient(API.profile.tour, { method: 'PUT' })
    } catch {
      // Silently fail
    }

    queryClient.setQueryData(profileKeys.detail(), (old: Profile | undefined) => {
      if (!old) return old
      return { ...old, hasCompletedTour: true }
    })

    try {
      await AsyncStorage.setItem(
        'orbit_tour_sections',
        JSON.stringify({
          habits: true,
          goals: true,
          chat: true,
          calendar: true,
          profile: true,
        }),
      )
    } catch {
      // Storage unavailable
    }
  }, [endTour, queryClient])

  const executePreAction = useCallback((preAction: string) => {
    switch (preAction) {
      case 'switchToGoalsTab':
        useUIStore.getState().setActiveView(hasProAccess ? 'goals' : 'today')
        break
      case 'switchToTodayTab':
        useUIStore.getState().setActiveView('today')
        break
      case 'scrollHabitsDown': {
        const entry = tourScrollRegistry.get('/')
        if (entry) entry.scrollTo(300)
        break
      }
      case 'scrollHabitsUp': {
        const entry = tourScrollRegistry.get('/')
        if (entry) entry.scrollTo(0)
        break
      }
    }
  }, [hasProAccess])

  /** Measure an element and apply Y correction */
  const measureAndSet = useCallback(
    (ref: { measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => void }) => {
      ref.measureInWindow((x, y, width, height) => {
        if (width > 0 && height > 0) {
          setTargetRect({ x, y: y + yAdjust, width, height })
          setNavigating(false)
        }
      })
    },
    [setTargetRect, setNavigating, yAdjust],
  )

  /**
   * Scroll the target into view and measure its position.
   * Uses tracked scroll offset to compute content-relative position,
   * then scrolls the container to center the element.
   */
  const scrollIntoViewAndMeasure = useCallback(
    (targetId: string, route: string): boolean => {
      const ref = tourTargetRegistry.getRef(targetId)
      if (!ref?.current) return false

      const screenHeight = Dimensions.get('window').height
      const scrollEntry = tourScrollRegistry.get(route)

      if (!scrollEntry) {
        // No scroll container - just measure in place
        measureAndSet(ref.current)
        return true
      }

      // Measure current screen position
      ref.current.measureInWindow((x, y, width, height) => {
        if (width <= 0 || height <= 0) return

        // Where we want the element: center of the visible area above tooltip
        const tooltipHeight = 280
        const visibleHeight = screenHeight - tooltipHeight
        const desiredScreenY = (visibleHeight / 2) - (height / 2)
        const scrollDelta = y - desiredScreenY

        // Scroll if element needs to move more than 20px
        if (Math.abs(scrollDelta) > 20) {
          const newScrollY = Math.max(0, scrollEntry.scrollY + scrollDelta)
          scrollEntry.scrollTo(newScrollY)
        }

        // Re-measure after scroll settles
        setTimeout(() => {
          if (ref.current) {
            measureAndSet(ref.current)
          }
        }, SCROLL_SETTLE_DELAY)
      })

      return true
    },
    [measureAndSet],
  )

  const waitForTarget = useCallback(
    (targetId: string, route: string) => {
      if (pollRef.current) clearInterval(pollRef.current)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)

      // Try immediately
      if (scrollIntoViewAndMeasure(targetId, route)) return

      // Poll until found
      let attempts = 0
      const maxAttempts = TARGET_FIND_TIMEOUT / MEASURE_POLL_INTERVAL

      pollRef.current = setInterval(() => {
        attempts++
        if (scrollIntoViewAndMeasure(targetId, route)) {
          if (pollRef.current) clearInterval(pollRef.current)
          return
        }
        if (attempts >= maxAttempts) {
          if (pollRef.current) clearInterval(pollRef.current)
          nextStep()
        }
      }, MEASURE_POLL_INTERVAL)

      timeoutRef.current = setTimeout(() => {
        if (pollRef.current) clearInterval(pollRef.current)
      }, TARGET_FIND_TIMEOUT + 100)
    },
    [scrollIntoViewAndMeasure, nextStep],
  )

  // Continuously re-measure the current target (mirrors web's scroll/resize listeners)
  useEffect(() => {
    if (!isActive) {
      if (reMeasureRef.current) clearInterval(reMeasureRef.current)
      return
    }

    reMeasureRef.current = setInterval(() => {
      const step = getCurrentStep()
      if (!step || useTourStore.getState().isNavigating) return

      const ref = tourTargetRegistry.getRef(step.targetId)
      if (!ref?.current) return

      ref.current.measureInWindow((x, y, width, height) => {
        if (width > 0 && height > 0) {
          setTargetRect({ x, y: y + yAdjust, width, height })
        }
      })
    }, RE_MEASURE_INTERVAL)

    return () => {
      if (reMeasureRef.current) clearInterval(reMeasureRef.current)
    }
  }, [isActive, getCurrentStep, setTargetRect, yAdjust])

  // React to step changes
  const currentStep = getCurrentStep()
  const stepId = currentStep?.id ?? null

  useEffect(() => {
    if (!isActive || !currentStep || stepId === prevStepIdRef.current) return
    prevStepIdRef.current = stepId

    if (currentStep.preAction) {
      executePreAction(currentStep.preAction)
    }

    const normalizedPathname = pathname === '/' ? '/' : pathname
    const routeMap: Record<string, string> = {
      '/': '/(tabs)',
      '/chat': '/chat',
      '/calendar': '/(tabs)/calendar',
      '/profile': '/(tabs)/profile',
    }
    const mobileRoute = routeMap[currentStep.route] ?? currentStep.route

    if (normalizedPathname !== currentStep.route && normalizedPathname !== mobileRoute) {
      setNavigating(true)
      router.push(mobileRoute as never)
      setTimeout(() => waitForTarget(currentStep.targetId, currentStep.route), SCROLL_SETTLE_DELAY + 100)
    } else {
      setNavigating(true)
      setTimeout(() => waitForTarget(currentStep.targetId, currentStep.route), 200)
    }
  }, [isActive, stepId, currentStep, pathname, router, setNavigating, executePreAction, waitForTarget])

  // When pathname changes during navigation, search for the element
  useEffect(() => {
    const step = getCurrentStep()
    if (!isActive || !step) return

    const normalizedPathname = pathname === '/' ? '/' : pathname
    const routeMap: Record<string, string> = {
      '/': '/(tabs)',
      '/chat': '/chat',
      '/calendar': '/(tabs)/calendar',
      '/profile': '/(tabs)/profile',
    }
    const mobileRoute = routeMap[step.route] ?? step.route

    if (
      (normalizedPathname === step.route || normalizedPathname === mobileRoute) &&
      useTourStore.getState().isNavigating
    ) {
      setTimeout(() => waitForTarget(step.targetId, step.route), SCROLL_SETTLE_DELAY)
    }
  }, [pathname, isActive, getCurrentStep, waitForTarget])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      if (pollRef.current) clearInterval(pollRef.current)
      if (reMeasureRef.current) clearInterval(reMeasureRef.current)
    }
  }, [])

  return <>{children}</>
}
