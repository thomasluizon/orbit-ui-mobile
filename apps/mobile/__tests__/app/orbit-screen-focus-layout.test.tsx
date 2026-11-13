import React from 'react'
import { act, create } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { RootStackScreens } from '@/components/navigation/root-stack-screens'
import { orbitScreenLayout } from '@/components/navigation/orbit-screen-layout'
import TabLayout from '@/app/(tabs)/_layout'
import OnboardingLayout from '@/app/(onboarding)/_layout'

const navigators = vi.hoisted(() => ({ layouts: [] as unknown[] }))
vi.mock('@/lib/motion', async (original) => ({ ...await original<typeof import('@/lib/motion')>(), usePrefersReducedMotion: () => false }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentTheme: 'dark', surfaces: { screen: { backgroundColor: 'black' } } }) }))
vi.mock('@/lib/capture-mode', () => ({ captureBuildEnabled: false, shouldExposeOnboardingRoute: () => false }))
vi.mock('@/lib/tab-scene-motion', () => ({ useTabSceneMotion: () => () => ({}) }))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: (select: (value: { isAuthenticated: boolean }) => unknown) => select({ isAuthenticated: true }) }))
vi.mock('@/stores/onboarding-draft-store', () => ({ useOnboardingDraftStore: (select: (value: { onboardingLocallyDone: boolean }) => unknown) => select({ onboardingLocallyDone: true }) }))
vi.mock('@/lib/google-auth-callback', () => ({ useGoogleErrorLogin: () => false }))
vi.mock('expo-router', () => {
  const Navigator = ({ children, screenLayout }: { children?: React.ReactNode; screenLayout?: unknown }) => {
    navigators.layouts.push(screenLayout)
    return <>{children}</>
  }
  const Screen = () => null
  const Protected = ({ children }: { children: React.ReactNode }) => <>{children}</>
  return {
    Stack: Object.assign(Navigator, { Screen, Protected }),
    Tabs: Object.assign((props: { children?: React.ReactNode; screenLayout?: unknown }) => <Navigator {...props} />, { Screen }),
    usePathname: () => '/',
    useIsFocused: () => true,
  }
})

describe('Orbit screen focus', () => {
  it.each([
    ['the root stack', () => <RootStackScreens />],
    ['the tabs', () => <TabLayout />],
    ['the onboarding stack', () => <OnboardingLayout />],
  ])('wraps every screen of %s in the Orbit focus layout', async (_name, element) => {
    navigators.layouts.length = 0
    let tree: ReturnType<typeof create> | undefined
    await act(() => { tree = create(element()) })
    expect(navigators.layouts.length).toBeGreaterThan(0)
    expect(new Set(navigators.layouts)).toEqual(new Set([orbitScreenLayout]))
    await act(() => tree!.unmount())
  })
})
