'use client'

import { useEffect, useRef, useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  createTourUIState,
  getPersistedUIState,
  type PersistedUIState,
} from '@orbit/shared/stores'
import type { TourStep } from '@orbit/shared/types'
import { useTourStore } from '@/stores/tour-store'
import { useUIStore } from '@/stores/ui-store'
import { useTourMockData } from '@/hooks/use-tour-mock-data'
import { useProfile } from '@/hooks/use-profile'
import { useIsDesktop } from '@/components/goals/use-is-desktop'

const TARGET_FIND_TIMEOUT = 5000
const SCROLL_SETTLE_DELAY = 350

const DESKTOP_STEP_ROUTE_OVERRIDES: Record<string, string> = {
  'profile-retrospective': '/explore',
}

/**
 * Tour orchestrator: handles navigation, element detection, mock data,
 * and cleanup. Renders nothing -- purely logic.
 */
export function TourProvider() {
  const router = useRouter()
  const pathname = usePathname()
  const { inject, restore } = useTourMockData()
  const { profile } = useProfile()
  const hasProAccess = profile?.hasProAccess ?? false
  const isDesktop = useIsDesktop()

  const store = useTourStore()
  const {
    isActive,
    getCurrentStep,
    setTargetRect,
    setNavigating,
    nextStep,
    setHiddenSections,
  } = store

  const resolveStepRoute = useCallback(
    (step: TourStep) =>
      (isDesktop ? DESKTOP_STEP_ROUTE_OVERRIDES[step.id] : undefined) ?? step.route,
    [isDesktop],
  )

  const prevStepIdRef = useRef<string | null>(null)
  const uiSnapshotRef = useRef<PersistedUIState | null>(null)
  const mockDataInjectedRef = useRef(false)
  const observerRef = useRef<MutationObserver | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const managedTimeoutsRef = useRef(new Set<ReturnType<typeof setTimeout>>())

  useEffect(() => {
    setHiddenSections(hasProAccess ? [] : ['goals'])
  }, [hasProAccess, setHiddenSections])

  const clearManagedTimeouts = useCallback(() => {
    managedTimeoutsRef.current.forEach((handle) => clearTimeout(handle))
    managedTimeoutsRef.current.clear()
  }, [])

  const scheduleTimeout = useCallback((callback: () => void, delay: number) => {
    const handle = setTimeout(() => {
      managedTimeoutsRef.current.delete(handle)
      callback()
    }, delay)

    managedTimeoutsRef.current.add(handle)
    return handle
  }, [])

  const resetSessionState = useCallback(() => {
    prevStepIdRef.current = null
    setTargetRect(null)
    setNavigating(false)
    observerRef.current?.disconnect()
    observerRef.current = null

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    clearManagedTimeouts()
  }, [clearManagedTimeouts, setNavigating, setTargetRect])

  const restoreTourSession = useCallback(() => {
    resetSessionState()

    if (mockDataInjectedRef.current) {
      restore()
      mockDataInjectedRef.current = false
    }

    if (uiSnapshotRef.current) {
      useUIStore.setState(uiSnapshotRef.current)
      uiSnapshotRef.current = null
    }
  }, [resetSessionState, restore])

  useEffect(() => {
    if (isActive && !mockDataInjectedRef.current) {
      uiSnapshotRef.current = getPersistedUIState(useUIStore.getState())
      useUIStore.setState(createTourUIState())
      resetSessionState()
      inject()
      mockDataInjectedRef.current = true
    }
    if (!isActive && (mockDataInjectedRef.current || uiSnapshotRef.current)) {
      restoreTourSession()
    }
  }, [isActive, inject, resetSessionState, restoreTourSession])

  const executePreAction = useCallback(
    (preAction: string) => {
      switch (preAction) {
        case 'switchToGoalsTab':
          useUIStore.getState().setActiveView(hasProAccess ? 'goals' : 'today')
          break
        case 'switchToTodayTab':
          useUIStore.getState().setActiveView('today')
          break
        case 'scrollHabitsDown':
        case 'scrollHabitsUp':
          break
      }
    },
    [hasProAccess],
  )

  const findAndMeasureTarget = useCallback(
    (targetId: string) => {
      const el = document.querySelector(`[data-tour="${targetId}"]`)
      if (!el) return false

      el.scrollIntoView({ behavior: 'smooth', block: 'center' })

      scheduleTimeout(() => {
        const rect = el.getBoundingClientRect()
        setTargetRect({
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        })
        setNavigating(false)
      }, SCROLL_SETTLE_DELAY)

      return true
    },
    [scheduleTimeout, setNavigating, setTargetRect],
  )

  const waitForTarget = useCallback(
    (targetId: string) => {
      if (findAndMeasureTarget(targetId)) return

      observerRef.current?.disconnect()
      if (timeoutRef.current) clearTimeout(timeoutRef.current)

      const observer = new MutationObserver(() => {
        if (findAndMeasureTarget(targetId)) {
          observer.disconnect()
          if (timeoutRef.current) clearTimeout(timeoutRef.current)
        }
      })

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-tour'],
      })

      observerRef.current = observer

      timeoutRef.current = setTimeout(() => {
        observer.disconnect()
        nextStep()
      }, TARGET_FIND_TIMEOUT)
    },
    [findAndMeasureTarget, nextStep],
  )

  const currentStep = getCurrentStep()
  const stepId = currentStep?.id ?? null

  useEffect(() => {
    if (!isActive || !currentStep || stepId === prevStepIdRef.current) return
    prevStepIdRef.current = stepId

    if (currentStep.preAction) {
      executePreAction(currentStep.preAction)
    }

    const normalizedPathname = pathname === '/' ? '/' : pathname
    const normalizedRoute = resolveStepRoute(currentStep)

    if (normalizedPathname === normalizedRoute) {
      setNavigating(true)
      scheduleTimeout(() => waitForTarget(currentStep.targetId), 100)
    } else {
      setNavigating(true)
      router.push(normalizedRoute)
    }
  }, [
    isActive,
    stepId,
    currentStep,
    pathname,
    router,
    setNavigating,
    executePreAction,
    waitForTarget,
    scheduleTimeout,
    resolveStepRoute,
  ])

  useEffect(() => {
    const step = getCurrentStep()
    if (!isActive || !step) return

    const normalizedPathname = pathname === '/' ? '/' : pathname
    const normalizedRoute = resolveStepRoute(step)

    if (
      normalizedPathname === normalizedRoute &&
      useTourStore.getState().isNavigating
    ) {
      scheduleTimeout(() => waitForTarget(step.targetId), 200)
    }
  }, [pathname, isActive, getCurrentStep, waitForTarget, scheduleTimeout, resolveStepRoute])

  useEffect(() => {
    if (!isActive) return

    let rafId: number

    const update = () => {
      const step = getCurrentStep()
      if (!step) return
      const el = document.querySelector(`[data-tour="${step.targetId}"]`)
      if (!el) return
      const rect = el.getBoundingClientRect()
      setTargetRect({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      })
    }

    const handleEvent = () => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(update)
    }

    window.addEventListener('scroll', handleEvent, { passive: true })
    window.addEventListener('resize', handleEvent, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleEvent)
      window.removeEventListener('resize', handleEvent)
      cancelAnimationFrame(rafId)
    }
  }, [isActive, getCurrentStep, setTargetRect])

  useEffect(() => {
    return () => {
      resetSessionState()
    }
  }, [resetSessionState])

  return null
}
