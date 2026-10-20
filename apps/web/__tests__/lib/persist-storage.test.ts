import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPersistStorage } from '@/lib/persist-storage'

describe('web persistence storage', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
  })

  it('persists and removes values when browser storage is available', () => {
    const storage = getPersistStorage()
    storage.setItem('preference', 'value')
    expect(localStorage.getItem('preference')).toBe('value')
    expect(storage.getItem('preference')).toBe('value')
    storage.removeItem('preference')
    expect(storage.getItem('preference')).toBeNull()
  })

  it('returns an empty storage adapter when the browser denies storage access', () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')!
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new DOMException('denied', 'SecurityError') },
    })

    try {
      const storage = getPersistStorage()
      expect(storage.getItem('preference')).toBeNull()
      expect(() => storage.setItem('preference', 'value')).not.toThrow()
      expect(() => storage.removeItem('preference')).not.toThrow()
    } finally {
      Object.defineProperty(window, 'localStorage', descriptor)
    }
  })

  it('keeps shell preference stores hydratable when storage is denied during import', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')!
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new DOMException('denied', 'SecurityError') },
    })

    try {
      const { setUIAccountScope, useUIStore, useUIPreferencesReadiness } = await import('@/stores/ui-store')
      const { useOnboardingDraftStore } = await import('@/stores/onboarding-draft-store')
      const { setEngagementPromptAccountScope, useEngagementPromptStore } = await import('@/stores/referral-prompt-store')

      expect(() => setUIAccountScope(null)).not.toThrow()
      await useUIStore.persist.rehydrate()
      expect(useUIStore.persist.hasHydrated()).toBe(true)
      expect(useUIPreferencesReadiness.getState().ready).toBe(true)
      await useOnboardingDraftStore.persist.rehydrate()
      expect(useOnboardingDraftStore.persist.hasHydrated()).toBe(true)
      expect(() => setEngagementPromptAccountScope(null)).not.toThrow()
      expect(useEngagementPromptStore.persist.hasHydrated()).toBe(true)
    } finally {
      Object.defineProperty(window, 'localStorage', descriptor)
    }
  })
})
