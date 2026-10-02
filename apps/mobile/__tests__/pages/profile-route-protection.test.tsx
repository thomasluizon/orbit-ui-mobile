import React from 'react'
import { readdirSync } from 'node:fs'
import { createRequire, Module } from 'node:module'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getRoutes } from 'expo-router/build/getRoutes'
import type { RequireContext } from 'expo-router/build/types'
import { Route } from 'expo-router/build/Route'
import { StackRouter } from 'expo-router/build/react-navigation/routers/StackRouter'
import { RootStackScreens } from '@/components/navigation/root-stack-screens'
import { redirectSystemPath } from '@/app/+native-intent'
import { useAuthStore } from '@/stores/auth-store'

const navigation = vi.hoisted(() => ({ routeNames: [] as string[] }))

vi.mock('expo-router', async () => {
  const routeContext = await import('expo-router/build/Route')
  const nativeRequire = createRequire(import.meta.url)
  function Screen() { return null }
  function Protected() { return null }
  const dependencies: Record<string, unknown> = {
    react: React,
    'react/jsx-runtime': await import('react/jsx-runtime'),
    '../Route': routeContext,
    './Route': routeContext,
    '../native-tabs/NativeTabTrigger': { isNativeTabTrigger: () => false },
    '../views/Screen': { Screen, isScreen: (child: React.ReactNode) => React.isValidElement(child) && child.type === Screen },
    '../views/Protected': { isProtectedReactElement: (child: React.ReactNode) => React.isValidElement(child) && child.type === Protected },
    './IsWithinLayoutContext': { IsWithinLayoutContext: React.createContext(false) },
    './primitives': { Screen },
  }
  function loadModule(path: string) {
    const moduleRequire = createRequire(nativeRequire.resolve(path))
    const previousModules = new Map<string, NodeModule | undefined>()
    const importedModules = path.endsWith('useScreens')
      ? Object.entries(dependencies).filter(([name]) => !name.startsWith('../') && name !== './IsWithinLayoutContext')
      : Object.entries(dependencies).filter(([name]) => name.startsWith('../') || name === './IsWithinLayoutContext' || !name.startsWith('.'))
    for (const [name, exports] of importedModules) {
      const filename = moduleRequire.resolve(name)
      previousModules.set(filename, nativeRequire.cache[filename])
      const replacement = new Module(filename)
      replacement.exports = exports
      replacement.loaded = true
      nativeRequire.cache[filename] = replacement
    }
    try {
      return nativeRequire(path)
    } finally {
      for (const [filename, previous] of previousModules) {
        if (previous) nativeRequire.cache[filename] = previous
        else delete nativeRequire.cache[filename]
      }
    }
  }
  dependencies['./global-state/storeContext'] = {}
  dependencies['./global-state/utils'] = {}
  dependencies['./hooks/useCurrentRouteInfo'] = {}
  dependencies['./import-mode'] = {}
  dependencies['./link/zoom/ZoomTransitionEnabler'] = {}
  dependencies['./link/zoom/zoom-transition-context-providers'] = {}
  dependencies['./navigationEvents'] = {}
  dependencies['./navigationParams'] = {}
  dependencies['./react-navigation/native'] = {}
  dependencies['./views/EmptyRoute'] = {}
  dependencies['./views/SuspenseFallback'] = {}
  dependencies['./views/Try'] = {}
  dependencies['../useScreens'] = loadModule('expo-router/build/useScreens')
  const { withLayoutContext } = loadModule('expo-router/build/layouts/withLayoutContext') as
    typeof import('expo-router/build/layouts/withLayoutContext')
  function Navigator({ children }: { children: React.ReactNode }) {
    navigation.routeNames = React.Children.toArray(children).map((child) => {
      if (!React.isValidElement<{ name: string }>(child)) throw new Error('Invalid screen')
      return child.props.name
    })
    return null
  }
  return { Stack: Object.assign(withLayoutContext(Navigator), { Screen, Protected }) }
})
vi.mock('@/stores/auth-store', async () => {
  const { create } = await import('zustand')
  return { useAuthStore: create(() => ({ isAuthenticated: false })) }
})
vi.mock('@/lib/google-auth-callback', () => ({ useGoogleErrorLogin: () => false }))
vi.mock('@/stores/onboarding-draft-store', () => ({
  useOnboardingDraftStore: (selector: (state: { onboardingLocallyDone: boolean }) => unknown) =>
    selector({ onboardingLocallyDone: true }),
}))
vi.mock('@/lib/motion', () => ({
  mobileMotion: { presets: { 'route-push': { enterDuration: 200 } } },
  usePrefersReducedMotion: () => false,
}))

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')
const appDirectory = resolve(__dirname, '../../app')
const context = Object.assign(() => ({}), {
  keys: () => readdirSync(appDirectory, { recursive: true, encoding: 'utf8' })
    .filter((path) => /\.[jt]sx?$/.test(path))
    .map((path) => `./${path.replaceAll('\\', '/')}`),
  resolve: (key: string) => key,
  id: 'profile-route-protection',
}) as RequireContext
const routes = getRoutes(context, { platform: 'android', ignoreEntryPoints: true, skipGenerated: true })
if (!routes) throw new Error('Root route tree was not generated')
const stackRouter = StackRouter({})
function routerOptions() {
  return { routeNames: navigation.routeNames, routeParamList: {}, routeGetIdList: {} }
}
async function mountNavigator() {
  let tree!: import('react-test-renderer').ReactTestRenderer
  await TestRenderer.act(() => {
    tree = TestRenderer.create(
      <Route node={routes!} params={{}}>
        <RootStackScreens screenBackgroundColor="transparent" />
      </Route>,
    )
  })
  return tree
}
const settingsRoutes = ['profile/account', 'profile/preferences', 'profile/astra', 'profile/notifications']
const legacyLinks = [
  '/preferences', '/advanced', 'orbit://ai-settings',
  'orbit://profile#notifications', 'https://app.useorbit.org/profile#ending',
  '/profile?subscription=success',
]

describe('Perfil submenu navigator protection', () => {
  beforeEach(() => { useAuthStore.setState({ isAuthenticated: false }) })

  it.each([...settingsRoutes.map((route) => `/${route}`), ...legacyLinks])(
    'rejects a signed-out direct or legacy link %s and stays at login', async (path) => {
      const tree = await mountNavigator()
      try {
        const destination = redirectSystemPath({ path, initial: true }).split(/[?#]/, 1)[0]!.slice(1)
        const state = stackRouter.getInitialState(routerOptions())
        expect(stackRouter.getStateForAction(state, { type: 'NAVIGATE', payload: { name: destination } }, routerOptions())).toBeNull()
        expect(state.routes[state.index]!.name).toBe('login')
        expect(navigation.routeNames.some((route) => settingsRoutes.includes(route))).toBe(false)
      } finally {
        await TestRenderer.act(() => tree.update(<></>))
      }
    },
  )

  it.each(settingsRoutes)('opens %s while signed in and removes it on authentication loss', async (name) => {
    useAuthStore.setState({ isAuthenticated: true })
    const tree = await mountNavigator()
    try {
      const state = stackRouter.getInitialState(routerOptions())
      const navigated = stackRouter.getStateForAction(state, { type: 'NAVIGATE', payload: { name } }, routerOptions())
      if (!navigated) throw new Error(`Signed-in navigation rejected ${name}`)
      const active = stackRouter.getRehydratedState(navigated, routerOptions())
      expect(active.routes[active.index]!.name).toBe(name)
      await TestRenderer.act(() => useAuthStore.setState({ isAuthenticated: false }))
      const signedOut = stackRouter.getStateForRouteNamesChange(active, { ...routerOptions(), routeKeyChanges: [] })
      expect(signedOut.routes[signedOut.index]!.name).toBe('login')
      expect(signedOut.routes.some((route) => settingsRoutes.includes(route.name))).toBe(false)
      expect(signedOut.routeNames.some((route) => settingsRoutes.includes(route))).toBe(false)
    } finally {
      await TestRenderer.act(() => tree.update(<></>))
    }
  })
})
