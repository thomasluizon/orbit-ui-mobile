import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import { habitKeys } from '@orbit/shared/query'
import type { Profile } from '@orbit/shared/types/profile'

import { usePreferenceControls } from '@/app/use-preference-controls'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => ({
  profile: undefined as Profile | undefined,
  patchProfile: vi.fn(),
  changeLanguage: vi.fn(),
  language: 'en',
  routerPush: vi.fn(),
  applyScheme: vi.fn(),
  applyTheme: vi.fn(),
  performQueuedApiMutation: vi.fn(async () => undefined),
  invalidateQueries: vi.fn(async () => {}),
  getItem: vi.fn(async (_key: string): Promise<string | null> => null),
  setItem: vi.fn(async (_key: string, _value: string) => {}),
  removeItem: vi.fn(async (_key: string) => {}),
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: mocks.getItem,
    setItem: mocks.setItem,
    removeItem: mocks.removeItem,
  },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: mocks.language, changeLanguage: mocks.changeLanguage },
  }),
}))

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: mocks.routerPush }),
}))

vi.mock('@tanstack/react-query', () => ({
  useMutation: vi.fn((config: unknown) => config),
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: mocks.profile, patchProfile: mocks.patchProfile }),
}))

vi.mock('@/lib/queued-api-mutation', () => ({
  performQueuedApiMutation: mocks.performQueuedApiMutation,
}))

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({
    applyScheme: mocks.applyScheme,
    applyTheme: mocks.applyTheme,
    currentTheme: 'dark',
    currentScheme: 'purple',
  }),
}))

type PreferenceControls = ReturnType<typeof usePreferenceControls>

interface RenderedControls {
  current: PreferenceControls
  rerender: () => Promise<void>
}

async function renderControls(): Promise<RenderedControls> {
  const ref: { current: PreferenceControls | null } = { current: null }
  function Harness() {
    ref.current = usePreferenceControls()
    return null
  }
  let root: { update: (element: React.ReactElement) => void }
  await TestRenderer.act(async () => {
    root = TestRenderer.create(React.createElement(Harness))
    await Promise.resolve()
    await Promise.resolve()
  })
  if (!ref.current) throw new Error('usePreferenceControls did not render')
  return {
    get current() {
      if (!ref.current) throw new Error('usePreferenceControls did not render')
      return ref.current
    },
    async rerender() {
      await TestRenderer.act(async () => {
        root.update(React.createElement(Harness))
        await Promise.resolve()
      })
    },
  }
}

function makeProfile(overrides: Partial<Profile>): Profile {
  return overrides as Profile
}

interface CapturedMutation {
  mutationFn: (variables: unknown) => Promise<unknown>
  onMutate?: (variables: unknown) => Promise<unknown> | unknown
  onError?: (error: unknown, variables: unknown, context: unknown) => void
  onSettled?: (
    data: unknown,
    error: unknown,
    variables: unknown,
    context: unknown,
  ) => void
}

function asMutation(mutation: unknown): CapturedMutation {
  return mutation as CapturedMutation
}

describe('usePreferenceControls', () => {
  beforeEach(() => {
    mocks.profile = undefined
    mocks.language = 'en'
    mocks.patchProfile.mockClear()
    mocks.changeLanguage.mockClear()
    mocks.routerPush.mockClear()
    mocks.applyScheme.mockClear()
    mocks.applyTheme.mockClear()
    mocks.performQueuedApiMutation.mockReset()
    mocks.performQueuedApiMutation.mockResolvedValue(undefined)
    mocks.invalidateQueries.mockClear()
    mocks.getItem.mockReset()
    mocks.getItem.mockResolvedValue(null)
    mocks.setItem.mockReset()
    mocks.setItem.mockResolvedValue(undefined)
    mocks.removeItem.mockReset()
    mocks.removeItem.mockResolvedValue(undefined)
  })

  it('changes language optimistically and persists it', async () => {
    const hook = await renderControls()

    await TestRenderer.act(async () => {
      await hook.current.handleLanguageChange('pt-BR')
    })

    expect(mocks.changeLanguage).toHaveBeenCalledWith('pt-BR')
    expect(mocks.performQueuedApiMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'setLanguage',
        endpoint: API.profile.language,
        method: 'PUT',
        payload: { language: 'pt-BR' },
      }),
    )
    expect(mocks.patchProfile).toHaveBeenCalledWith({ language: 'pt-BR' })
    expect(hook.current.selectedLanguage).toBe('pt-BR')
  })

  it('follows the server profile language when it loads or changes', async () => {
    mocks.profile = makeProfile({ language: 'en' })
    const hook = await renderControls()
    expect(hook.current.selectedLanguage).toBe('en')

    mocks.profile = makeProfile({ language: 'pt-BR' })
    await hook.rerender()

    expect(hook.current.selectedLanguage).toBe('pt-BR')
  })

  it('rolls the language back when persistence fails', async () => {
    mocks.performQueuedApiMutation.mockRejectedValueOnce(new Error('offline'))
    const hook = await renderControls()

    await TestRenderer.act(async () => {
      await hook.current.handleLanguageChange('pt-BR')
    })

    expect(mocks.changeLanguage).toHaveBeenNthCalledWith(1, 'pt-BR')
    expect(mocks.changeLanguage).toHaveBeenNthCalledWith(2, 'en')
    expect(hook.current.selectedLanguage).toBe('en')
    expect(mocks.patchProfile).not.toHaveBeenCalled()
  })

  it('optimistically updates the week start and rolls back on error', async () => {
    mocks.profile = makeProfile({ weekStartDay: 0 })
    const hook = await renderControls()

    const weekStartMutation = asMutation(hook.current.weekStartMutation)
    const context = weekStartMutation.onMutate?.(1)
    expect(mocks.patchProfile).toHaveBeenCalledWith({ weekStartDay: 1 })
    expect(context).toEqual({ previous: 0 })

    weekStartMutation.onError?.(new Error('boom'), 1, { previous: 0 })
    expect(mocks.patchProfile).toHaveBeenLastCalledWith({ weekStartDay: 0 })
  })

  it('wires the week-start mutation to the queued endpoint', async () => {
    const hook = await renderControls()

    await asMutation(hook.current.weekStartMutation).mutationFn(1)

    expect(mocks.performQueuedApiMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'setWeekStartDay',
        endpoint: API.profile.weekStartDay,
        method: 'PUT',
        payload: { weekStartDay: 1 },
        dedupeKey: 'profile-week-start-day',
      }),
    )
  })

  it('invalidates the habit caches after the week-start mutation settles', async () => {
    const hook = await renderControls()

    asMutation(hook.current.weekStartMutation).onSettled?.(undefined, null, 1, undefined)

    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: habitKeys.calendarPrefix(),
    })
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: habitKeys.lists(),
    })
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: habitKeys.summaryPrefix(),
    })
  })

  it('routes a free user to upgrade when picking a non-purple scheme', async () => {
    mocks.profile = makeProfile({ hasProAccess: false })
    const hook = await renderControls()

    TestRenderer.act(() => {
      hook.current.handleSchemeChange('blue')
    })

    expect(mocks.routerPush).toHaveBeenCalledTimes(1)
    expect(mocks.applyScheme).not.toHaveBeenCalled()
  })

  it('applies a scheme for a pro user without routing to upgrade', async () => {
    mocks.profile = makeProfile({ hasProAccess: true })
    const hook = await renderControls()

    TestRenderer.act(() => {
      hook.current.handleSchemeChange('blue')
    })

    expect(mocks.applyScheme).toHaveBeenCalledWith('blue')
    expect(mocks.routerPush).not.toHaveBeenCalled()
  })

  it('lets a free user keep the default purple scheme', async () => {
    mocks.profile = makeProfile({ hasProAccess: false })
    const hook = await renderControls()

    TestRenderer.act(() => {
      hook.current.handleSchemeChange('purple')
    })

    expect(mocks.applyScheme).toHaveBeenCalledWith('purple')
    expect(mocks.routerPush).not.toHaveBeenCalled()
  })

  it('applies a theme change only when the mode actually differs', async () => {
    const hook = await renderControls()

    TestRenderer.act(() => {
      hook.current.handleThemeModeChange('dark')
    })
    expect(mocks.applyTheme).not.toHaveBeenCalled()

    TestRenderer.act(() => {
      hook.current.handleThemeModeChange('light')
    })
    expect(mocks.applyTheme).toHaveBeenCalledWith('light')
  })

  it('persists the show-general toggle and reverts if storage fails', async () => {
    const hook = await renderControls()

    await TestRenderer.act(async () => {
      await hook.current.handleShowGeneralToggle(true)
    })
    expect(mocks.setItem).toHaveBeenCalledWith('orbit_show_general_on_today', 'true')
    expect(hook.current.showGeneralOnToday).toBe(true)

    mocks.setItem.mockRejectedValueOnce(new Error('disk full'))
    await TestRenderer.act(async () => {
      await hook.current.handleShowGeneralToggle(false)
    })
    expect(hook.current.showGeneralOnToday).toBe(true)
  })

  it('hydrates the show-general toggle from storage on mount', async () => {
    mocks.getItem.mockResolvedValue('true')

    const hook = await renderControls()

    expect(mocks.removeItem).toHaveBeenCalledWith('orbit_time_format')
    expect(hook.current.showGeneralOnToday).toBe(true)
  })

  it('defaults the show-general toggle to false when the storage read fails', async () => {
    mocks.getItem.mockRejectedValue(new Error('read fail'))

    const hook = await renderControls()

    expect(hook.current.showGeneralOnToday).toBe(false)
  })
})
