import React from 'react'
import { Platform } from 'react-native'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { RootStackScreens } from '@/components/navigation/root-stack-screens'

const state = vi.hoisted((): { theme: 'dark' | 'light'; options: Record<string, unknown> } => ({ theme: 'dark', options: {} }))
vi.mock('@/lib/motion', async (original) => ({ ...await original<typeof import('@/lib/motion')>(), usePrefersReducedMotion: () => false }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentTheme: state.theme, surfaces: { screen: { backgroundColor: 'black' } } }) }))
vi.mock('@/lib/capture-mode', () => ({ captureBuildEnabled: false, shouldExposeOnboardingRoute: () => false }))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: (select: (value: { isAuthenticated: boolean }) => unknown) => select({ isAuthenticated: true }) }))
vi.mock('@/stores/onboarding-draft-store', () => ({ useOnboardingDraftStore: (select: (value: { onboardingLocallyDone: boolean }) => unknown) => select({ onboardingLocallyDone: true }) }))
vi.mock('@/lib/google-auth-callback', () => ({ useGoogleErrorLogin: () => false }))
vi.mock('expo-router', () => {
  const Navigator = ({ children, screenOptions }: { children: React.ReactNode; screenOptions: Record<string, unknown> }) => { state.options = screenOptions; return <>{children}</> }
  const Screen = () => null
  const Protected = ({ children, guard }: { children: React.ReactNode; guard: boolean }) => guard ? <>{children}</> : null
  return { Stack: Object.assign(Navigator, { Screen, Protected }) }
})

async function renderStackOptions(): Promise<Record<string, unknown>> {
  let tree: ReactTestRenderer
  await act(() => { tree = create(<RootStackScreens screenBackgroundColor="black" />) })
  const options = state.options
  await act(() => tree.update(<></>))
  return options
}

beforeEach(() => { state.theme = 'dark'; state.options = {} })
afterEach(() => { Platform.OS = 'android' })

it.each([
  ['dark', 'light'],
  ['light', 'dark'],
] as const)('gives every iOS screen the %s theme glyph style %s', async (theme, style) => {
  Platform.OS = 'ios'
  state.theme = theme
  expect((await renderStackOptions()).statusBarStyle).toBe(style)
})

it('leaves the Android screens on the root status bar', async () => {
  Platform.OS = 'android'
  expect(await renderStackOptions()).not.toHaveProperty('statusBarStyle')
})
