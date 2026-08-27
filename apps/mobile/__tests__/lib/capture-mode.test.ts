import { describe, expect, it, vi } from 'vitest'
import { Animated } from 'react-native'
import {
  captureRouteProbeId,
  resolveCapturePreferences,
  shouldExposeOnboardingRoute,
  shouldRetainEmptyAuthCallback,
} from '@/lib/capture-mode'
import {
  pinCaptureAnimationDurations,
  type CaptureAnimatedDriver,
} from '@/lib/capture-animation-pin'

function animation() {
  return {
    start: vi.fn(),
    stop: vi.fn(),
  }
}

describe('mobile capture mode', () => {
  it('accepts an explicit theme and locale only in a capture build', () => {
    const parameters = { captureLocale: 'pt-BR', captureTheme: 'dark' }

    expect(resolveCapturePreferences(true, parameters)).toEqual({
      locale: 'pt-BR',
      theme: 'dark',
    })
    expect(resolveCapturePreferences(false, parameters)).toBeNull()
  })

  it('rejects incomplete and unsupported capture preferences', () => {
    expect(
      resolveCapturePreferences(true, {
        captureLocale: 'fr',
        captureTheme: 'dark',
      }),
    ).toBeNull()
    expect(
      resolveCapturePreferences(true, { captureLocale: 'en' }),
    ).toBeNull()
  })

  it('keeps first-run onboarding out of capture builds so deep links remain authoritative', () => {
    expect(shouldExposeOnboardingRoute(true, false, false)).toBe(false)
    expect(shouldExposeOnboardingRoute(false, false, false)).toBe(true)
    expect(shouldExposeOnboardingRoute(false, true, false)).toBe(false)
    expect(shouldExposeOnboardingRoute(false, false, true)).toBe(false)
  })

  it('retains the payload-free auth callback only for deterministic capture evidence', () => {
    expect(shouldRetainEmptyAuthCallback(true)).toBe(true)
    expect(shouldRetainEmptyAuthCallback(false)).toBe(false)
  })

  it('identifies colliding root routes by their router group', () => {
    expect(captureRouteProbeId('/', '(tabs)')).toBe(
      'capture-route-tabs-index',
    )
    expect(captureRouteProbeId('/', '(onboarding)')).toBe(
      'capture-route-onboarding-index',
    )
    expect(captureRouteProbeId('/privacy', 'privacy')).toBe(
      'capture-route-privacy',
    )
  })

  it('pins timing, spring, loop, and stagger motion for capture builds', () => {
    const timing = vi.fn(() => animation())
    const parallel = vi.fn(() => animation())
    const driver: CaptureAnimatedDriver = {
      timing,
      spring: vi.fn(() => animation()),
      loop: vi.fn(() => animation()),
      stagger: vi.fn(() => animation()),
      parallel,
    }

    pinCaptureAnimationDurations(driver)
    driver.timing('value', { toValue: 1, duration: 280, useNativeDriver: true })
    driver.spring('value', { toValue: 1, useNativeDriver: true })
    const child = animation()

    expect(timing).toHaveBeenNthCalledWith(1, 'value', {
      delay: 0,
      duration: 0,
      toValue: 1,
      useNativeDriver: true,
    })
    expect(timing).toHaveBeenNthCalledWith(2, 'value', {
      delay: 0,
      duration: 0,
      toValue: 1,
      useNativeDriver: true,
    })
    expect(driver.loop(child)).toBe(child)
    expect(driver.stagger(80, [child])).toBe(parallel.mock.results[0]?.value)
    expect(parallel).toHaveBeenCalledWith([child])
  })

  it('pins the native Animated driver once for the capture process', () => {
    const timing = vi.spyOn(Animated, 'timing')
    const parallel = vi.spyOn(Animated, 'parallel')

    pinCaptureAnimationDurations()
    pinCaptureAnimationDurations()

    const driver = Animated as unknown as CaptureAnimatedDriver
    const child = animation()
    driver.timing('value', {
      delay: 80,
      duration: 280,
      toValue: 1,
      useNativeDriver: true,
    })
    driver.spring('value', {
      delay: 80,
      toValue: 1,
      useNativeDriver: true,
    })

    expect(timing).toHaveBeenNthCalledWith(1, 'value', {
      delay: 0,
      duration: 0,
      toValue: 1,
      useNativeDriver: true,
    })
    expect(timing).toHaveBeenNthCalledWith(2, 'value', {
      delay: 0,
      duration: 0,
      toValue: 1,
      useNativeDriver: true,
    })
    expect(driver.loop(child)).toBe(child)
    expect(driver.stagger(80, [child])).toBe(parallel.mock.results[0]?.value)
    expect(parallel).toHaveBeenCalledWith([child])
  })
})
