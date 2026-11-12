import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, expect, it, vi } from 'vitest'
import { resolveMotionPreset } from '@orbit/shared/theme'
import { RootStackScreens } from '@/components/navigation/root-stack-screens'
import TabLayout from '@/app/(tabs)/_layout'

type Options = Record<string, unknown>
const state = vi.hoisted((): { reducedMotion: boolean; options: Options | ((props: { route: { name: string } }) => Options); screens: Map<string, Options> } => ({ reducedMotion: false, options: {}, screens: new Map() }))
const optionsFor = (name: string) => typeof state.options === 'function' ? state.options({ route: { name } }) : state.options
vi.mock('@/lib/motion', async (original) => ({ ...await original<typeof import('@/lib/motion')>(), usePrefersReducedMotion: () => state.reducedMotion }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ surfaces: { screen: { backgroundColor: 'black' } } }) }))
vi.mock('@/lib/capture-mode', () => ({ captureBuildEnabled: false, shouldExposeOnboardingRoute: () => false }))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: (select: (value: { isAuthenticated: boolean }) => unknown) => select({ isAuthenticated: true }) }))
vi.mock('@/stores/onboarding-draft-store', () => ({ useOnboardingDraftStore: (select: (value: { onboardingLocallyDone: boolean }) => unknown) => select({ onboardingLocallyDone: true }) }))
vi.mock('@/lib/google-auth-callback', () => ({ useGoogleErrorLogin: () => false }))
vi.mock('expo-router', () => {
  const Navigator = ({ children, screenOptions }: { children: React.ReactNode; screenOptions: Record<string, unknown> }) => { state.options = screenOptions; return <>{children}</> }
  const Screen = ({ name, options = {} }: { name: string; options?: Record<string, unknown> }) => { state.screens.set(name, options); return null }
  const Protected = ({ children, guard }: { children: React.ReactNode; guard: boolean }) => guard ? <>{children}</> : null
  return { Stack: Object.assign(Navigator, { Screen, Protected }), Tabs: Object.assign(Navigator, { Screen }), usePathname: () => '/' }
})


beforeEach(() => { state.reducedMotion = false; state.screens.clear() })

it('uses native push and pop for detail and profile routes and vertical modal entry', async () => {
  let tree: ReactTestRenderer
  await act(() => { tree = create(<RootStackScreens />) })
  expect(optionsFor('index').animation).toBe('slide_from_right')
  expect(optionsFor('index').animationDuration).toBe(resolveMotionPreset('route-push').enterDuration)
  for (const name of ['profile/account', 'profile/preferences', 'progress/goals', 'progress/streak']) expect(state.screens.get(name)?.animation).toBeUndefined()
  expect(state.screens.get('upgrade')?.animation).toBe('slide_from_bottom')
  await act(() => tree.update(<></>))
})

it('removes native travel from every stack override and tab when reduced motion is requested', async () => {
  state.reducedMotion = true
  let tree: ReactTestRenderer
  await act(() => { tree = create(<RootStackScreens />) })
  expect(optionsFor('index').animation).toBe('none')
  expect(optionsFor('index').animationDuration).toBe(0)
  for (const options of state.screens.values()) if (options.animation) expect(options.animation).toBe('none')
  await act(() => tree.update(<TabLayout />))
  for (const name of ['index', 'calendar', 'progress', 'profile']) expect(optionsFor(name).animation).toBe('none')
  await act(() => tree.update(<></>))
})

it('gives all four tabs the shared short transition', async () => {
  let tree: ReactTestRenderer
  await act(() => { tree = create(<TabLayout />) })
  const tabSwitch = resolveMotionPreset('tab-switch')
  for (const name of ['index', 'calendar', 'progress', 'profile']) {
    expect(optionsFor(name).transitionSpec).toMatchObject({ config: { duration: Math.max(tabSwitch.enterDuration, tabSwitch.exitDuration) } })
    expect(optionsFor(name).sceneStyleInterpolator).toBeTypeOf('function')
  }
  expect([...state.screens.keys()]).toEqual(['index', 'calendar', 'progress', 'profile'])
  await act(() => tree.update(<></>))
})
