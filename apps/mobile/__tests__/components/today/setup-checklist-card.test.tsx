import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import type { Profile } from '@orbit/shared/types/profile'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { SetupChecklistCard } from '@/components/today/setup-checklist-card'
import { setUIAccountScope, useUIStore } from '@/stores/ui-store'

const storedValues = vi.hoisted(() => new Map<string, string>())
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: (key: string) => Promise.resolve(storedValues.get(key) ?? null),
  setItem: (key: string, value: string) => { storedValues.set(key, value); return Promise.resolve() },
  removeItem: (key: string) => { storedValues.delete(key); return Promise.resolve() },
} }))

const profileState = vi.hoisted(() => ({ profile: undefined as Profile | undefined, locale: 'en' }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => profileState }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({
  t: (key: string, values?: Record<string, string | number>) => {
    let message: unknown = profileState.locale === 'en' ? en : pt
    for (const part of key.split('.')) message = (message as Record<string, unknown>)[part]
    return String(message).replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name]))
  },
}) }))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type MountedCard = TestRenderer.ReactTestRenderer & { toJSON: () => unknown; unmount: () => void }
let page: MountedCard
function dismissButtons() {
  return page.root.findAll((node) => String(node.type) === 'Pressable' && node.props.accessibilityLabel === (profileState.locale === 'en' ? en : pt).today.setupChecklist.dismiss)
}
function renderedText() {
  return JSON.stringify(page.toJSON())
}

beforeEach(async () => {
  profileState.profile = createMockProfile({ isTrialActive: false })
  profileState.locale = 'en'
  useUIStore.persist.setOptions({ name: 'orbit-ui-store' })
  await AsyncStorage.setItem('orbit-ui-store', JSON.stringify({ state: { setupChecklistDismissed: false }, version: 6 }))
  await useUIStore.persist.rehydrate()
})
afterEach(async () => {
  await act(() => page.unmount())
  vi.restoreAllMocks()
})

describe('setup checklist', () => {
  it.each(['en', 'pt-BR'])('derives every item and progress from profile flags in %s', async (locale) => {
    profileState.locale = locale
    profileState.profile = createMockProfile({ isTrialActive: false, hasCreatedFirstHabit: true, hasTriedAstra: true })
    await act(() => { page = TestRenderer.create(<SetupChecklistCard />) as MountedCard })
    const messages = locale === 'en' ? en : pt
    expect(renderedText()).toContain(locale === 'en' ? '2 of 3 done' : '2 de 3 concluídos')
    expect(page.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityLabel === `${messages.today.setupChecklist.items.createHabit}, ${messages.habits.completed}`)).toHaveLength(1)
    expect(page.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityLabel === messages.today.setupChecklist.items.logHabit)).toHaveLength(1)
  })

  it.each(['loading', 'onboarding', 'trial', 'complete', 'dismissed'])('withholds the card for %s', async (state) => {
    if (state === 'loading') profileState.profile = undefined
    if (state === 'onboarding') profileState.profile = createMockProfile({ hasCompletedOnboarding: false, isTrialActive: false })
    if (state === 'trial') profileState.profile = createMockProfile({ isTrialActive: true })
    if (state === 'complete') profileState.profile = createMockProfile({ hasCompletedOnboardingChecklist: true, isTrialActive: false })
    if (state === 'dismissed') await useUIStore.getState().setSetupChecklistDismissed(true)
    await act(() => { page = TestRenderer.create(<SetupChecklistCard />) as MountedCard })
    expect(page.toJSON()).toBeNull()
  })

  it.each([false, true])('recovers readable account preferences after migration writeback fails with dismissed=%s', async (dismissed) => {
    await AsyncStorage.setItem('orbit-ui-store:migration-account', JSON.stringify({ state: { setupChecklistDismissed: dismissed }, version: 6 }))
    vi.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('Storage is full'))
    await setUIAccountScope('migration-account')
    await act(() => { page = TestRenderer.create(<SetupChecklistCard />) as MountedCard })
    expect(useUIStore.persist.hasHydrated()).toBe(false)
    expect(useUIStore.getState().setupChecklistDismissed).toBe(dismissed)
    if (dismissed) {
      expect(page.toJSON()).toBeNull()
      return
    }
    expect(renderedText()).toContain(en.today.setupChecklist.title)
    vi.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('Storage is still full'))
    await act(async () => { (dismissButtons()[0]!.props.onPress as () => void)(); await Promise.resolve() })
    expect(renderedText()).toContain(en.today.setupChecklist.dismissError)
    await act(async () => { (dismissButtons()[0]!.props.onPress as () => void)(); await Promise.resolve() })
    expect(page.toJSON()).toBeNull()
    await useUIStore.persist.rehydrate()
    expect(useUIStore.getState().setupChecklistDismissed).toBe(true)
  })

  it.each([false, true])('withholds the previous account preference until a replacement migration fails with dismissed=%s', async (dismissed) => {
    await act(() => { page = TestRenderer.create(<SetupChecklistCard />) as MountedCard })
    await AsyncStorage.setItem('orbit-ui-store:pending-replacement-account', JSON.stringify({ state: { setupChecklistDismissed: dismissed }, version: 6 }))
    const read = AsyncStorage.getItem.bind(AsyncStorage)
    let finish!: () => void
    vi.spyOn(AsyncStorage, 'getItem').mockImplementationOnce((key) => new Promise<void>((resolve) => { finish = resolve }).then(() => read(key)))
    vi.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('Storage is full'))
    let replacement!: Promise<void>
    await act(() => { replacement = setUIAccountScope('pending-replacement-account') })
    expect(page.toJSON()).toBeNull()
    await act(async () => { finish(); await replacement })
    expect(useUIStore.persist.hasHydrated()).toBe(false)
    expect(useUIStore.getState().setupChecklistDismissed).toBe(dismissed)
    expect(page.toJSON() === null).toBe(dismissed)
  })

  it('shows a persistence error and allows retry after a failed dismissal', async () => {
    await act(() => { page = TestRenderer.create(<SetupChecklistCard />) as MountedCard })
    vi.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('Storage is full'))
    await act(async () => { (dismissButtons()[0]!.props.onPress as () => void)(); await Promise.resolve() })
    expect(renderedText()).toContain(en.today.setupChecklist.dismissError)
    expect(useUIStore.getState().setupChecklistDismissed).toBe(false)
    await act(async () => { (dismissButtons()[0]!.props.onPress as () => void)(); await Promise.resolve() })
    expect(page.toJSON()).toBeNull()
    await useUIStore.persist.rehydrate()
    expect(useUIStore.getState().setupChecklistDismissed).toBe(true)
  })

  it('disables dismissal while storage is pending', async () => {
    let finish!: () => void
    vi.spyOn(AsyncStorage, 'setItem').mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
    await act(() => { page = TestRenderer.create(<SetupChecklistCard />) as MountedCard })
    await act(() => { (dismissButtons()[0]!.props.onPress as () => void)() })
    expect(dismissButtons()[0]!.props.disabled).toBe(true)
    expect((dismissButtons()[0]!.props.accessibilityState as { busy: boolean }).busy).toBe(true)
    await act(async () => { finish(); await Promise.resolve() })
    expect(page.toJSON()).toBeNull()
  })
})
