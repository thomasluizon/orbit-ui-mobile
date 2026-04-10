import { useEffect, useRef, useCallback, useState, useMemo, type RefObject } from 'react'
import type { View } from 'react-native'
import { usePathname, useRouter } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { profileKeys } from '@orbit/shared/query'
import type { Profile } from '@orbit/shared/types'
import { useTourStore } from '@/stores/tour-store'
import { useUIStore } from '@/stores/ui-store'
import { useTourMockData } from '@/hooks/use-tour-mock-data'
import { TourTargetContext, type TourTargetRegistry } from './tour-target-context'
import { API } from '@orbit/shared/api'
import { apiClient } from '@/lib/api-client'
import AsyncStorage from '@react-native-async-storage/async-storage'

const TARGET_FIND_TIMEOUT = 5000
const MEASURE_DELAY = 400

interface TourProviderProps {
  children: React.ReactNode
}

export function TourProvider({ children }: TourProviderProps) {
  const router = useRouter()
  const pathname = usePathname()
  const queryClient = useQueryClient()
  const { inject, restore } = useTourMockData()

  const store = useTourStore()
  const { isActive, getCurrentStep, setTargetRect, setNavigating, endTour, nextStep } = store

  const prevStepIdRef = useRef<string | null>(null)
  const mockDataInjectedRef = useRef(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const refsMap = useRef<Map<string, RefObject<View | null>>>(new Map())

  // Ref registry for tour targets
  const registry: TourTargetRegistry = useMemo(
    () => ({
      register: (targetId: string, ref: RefObject<View | null>) => {
        refsMap.current.set(targetId, ref)
      },
      unregister: (targetId: string) => {
        refsMap.current.delete(targetId)
      },
      getRef: (targetId: string) => refsMap.current.get(targetId),
    }),
    [],
  )

  // Inject mock data when tour starts
  useEffect(() => {
    if (isActive && !mockDataInjectedRef.current) {
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
        useUIStore.getState().setActiveView('goals')
        break
      case 'switchToTodayTab':
        useUIStore.getState().setActiveView('today')
        break
    }
  }, [])

  const measureTarget = useCallback(
    (targetId: string) => {
      const ref = refsMap.current.get(targetId)
      if (!ref?.current) return false

      ref.current.measureInWindow((x, y, width, height) => {
        if (width > 0 && height > 0) {
          setTargetRect({ x, y, width, height })
          setNavigating(false)
        }
      })

      return true
    },
    [setTargetRect, setNavigating],
  )

  const waitForTarget = useCallback(
    (targetId: string) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)

      // Try immediately
      if (measureTarget(targetId)) return

      // Poll until found
      let attempts = 0
      const maxAttempts = TARGET_FIND_TIMEOUT / 200

      const poll = setInterval(() => {
        attempts++
        if (measureTarget(targetId)) {
          clearInterval(poll)
          return
        }
        if (attempts >= maxAttempts) {
          clearInterval(poll)
          nextStep()
        }
      }, 200)

      timeoutRef.current = setTimeout(() => clearInterval(poll), TARGET_FIND_TIMEOUT + 100)
    },
    [measureTarget, nextStep],
  )

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
      setTimeout(() => waitForTarget(currentStep.targetId), MEASURE_DELAY)
    } else {
      setNavigating(true)
      setTimeout(() => waitForTarget(currentStep.targetId), 200)
    }
  }, [isActive, stepId, currentStep, pathname, router, setNavigating, executePreAction, waitForTarget])

  // Cleanup
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  return (
    <TourTargetContext.Provider value={registry}>
      {children}
    </TourTargetContext.Provider>
  )
}
