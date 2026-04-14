'use client'

import { useEffect, useRef, useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useTourStore } from '@/stores/tour-store'
import { useUIStore } from '@/stores/ui-store'
import { useTourMockData } from '@/hooks/use-tour-mock-data'
import { useProfile } from '@/hooks/use-profile'
import { completeTour } from '@/app/actions/profile'
import { useQueryClient } from '@tanstack/react-query'
import { profileKeys } from '@orbit/shared/query'
import type { Profile } from '@orbit/shared/types'

const TARGET_FIND_TIMEOUT = 5000
const SCROLL_SETTLE_DELAY = 350

/**
 * Tour orchestrator: handles navigation, element detection, mock data,
 * and cleanup. Renders nothing -- purely logic.
 */
export function TourProvider() {
  const router = useRouter()
  const pathname = usePathname()
  const queryClient = useQueryClient()
  const { inject, restore } = useTourMockData()
  const { profile } = useProfile()
  const hasProAccess = profile?.hasProAccess ?? false

  const store = useTourStore()
  const { isActive, getCurrentStep, setTargetRect, setNavigating, endTour, nextStep } = store

  const prevStepIdRef = useRef<string | null>(null)
  const mockDataInjectedRef = useRef(false)
  const observerRef = useRef<MutationObserver | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Inject mock data and reset view when tour starts
  useEffect(() => {
    if (isActive && !mockDataInjectedRef.current) {
      // Switch to Today tab so mock habits are visible
      useUIStore.getState().setActiveView('today')
      inject()
      mockDataInjectedRef.current = true
    }
    if (!isActive && mockDataInjectedRef.current) {
      restore()
      mockDataInjectedRef.current = false
    }
  }, [isActive, inject, restore])

  // Handle tour completion
  const handleEndTour = useCallback(async () => {
    endTour()

    // Mark tour as completed
    try {
      await completeTour()
    } catch {
      // Silently fail -- tour state is client-side too
    }

    // Optimistically update profile cache
    queryClient.setQueryData(profileKeys.detail(), (old: Profile | undefined) => {
      if (!old) return old
      return { ...old, hasCompletedTour: true }
    })

    // Save section completion to localStorage
    try {
      localStorage.setItem(
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
      // localStorage not available
    }
  }, [endTour, queryClient])

  // Expose handleEndTour via store override
  const endTourRef = useRef(handleEndTour)
  endTourRef.current = handleEndTour

  // Execute pre-actions for a step
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
          // Web handles this via scrollIntoView, no-op here
          break
      }
    },
    [hasProAccess],
  )

  // Find target element and set rect
  const findAndMeasureTarget = useCallback(
    (targetId: string) => {
      const el = document.querySelector(`[data-tour="${targetId}"]`)
      if (!el) return false

      el.scrollIntoView({ behavior: 'smooth', block: 'center' })

      setTimeout(() => {
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
    [setTargetRect, setNavigating],
  )

  // Watch for target element via MutationObserver
  const waitForTarget = useCallback(
    (targetId: string) => {
      // Try immediately
      if (findAndMeasureTarget(targetId)) return

      // Set up observer
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

      // Timeout: skip this step if element not found
      timeoutRef.current = setTimeout(() => {
        observer.disconnect()
        nextStep()
      }, TARGET_FIND_TIMEOUT)
    },
    [findAndMeasureTarget, nextStep],
  )

  // React to step changes
  const currentStep = getCurrentStep()
  const stepId = currentStep?.id ?? null

  useEffect(() => {
    if (!isActive || !currentStep || stepId === prevStepIdRef.current) return
    prevStepIdRef.current = stepId

    // Execute pre-action if any
    if (currentStep.preAction) {
      executePreAction(currentStep.preAction)
    }

    // Navigate if needed
    const normalizedPathname = pathname === '/' ? '/' : pathname
    const normalizedRoute = currentStep.route === '/' ? '/' : currentStep.route

    if (normalizedPathname === normalizedRoute) {
      // Same page: find element immediately
      setNavigating(true)
      // Small delay to allow pre-actions (e.g. tab switch) to render
      setTimeout(() => waitForTarget(currentStep.targetId), 100)
    } else {
      setNavigating(true)
      router.push(normalizedRoute)
      // waitForTarget will be called when pathname changes (below)
    }
  }, [isActive, stepId, currentStep, pathname, router, setNavigating, executePreAction, waitForTarget])

  // When pathname changes during navigation, search for the element
  useEffect(() => {
    const step = getCurrentStep()
    if (!isActive || !step) return

    const normalizedPathname = pathname === '/' ? '/' : pathname
    const normalizedRoute = step.route === '/' ? '/' : step.route

    if (normalizedPathname === normalizedRoute && useTourStore.getState().isNavigating) {
      // Arrived at the target page, wait for element
      setTimeout(() => waitForTarget(step.targetId), 200)
    }
  }, [pathname, isActive, getCurrentStep, waitForTarget])

  // Update target rect on scroll/resize
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      observerRef.current?.disconnect()
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  return null
}
