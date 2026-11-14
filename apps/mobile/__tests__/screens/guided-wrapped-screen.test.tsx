import React from 'react'
import { act, create } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createMockRecap } from '@orbit/shared/__tests__/factories'
import { enableTestFlags } from '@orbit/shared/test-support/flag-state'
import WrappedScreen from '@/app/wrapped'
import { testI18n } from '@/__tests__/support/i18n'
import { measureSafeArea, type GeometryTree } from '@/__tests__/support/safe-area-geometry'
import { __setWindowDimensions } from '@/test-mocks/react-native'

interface WrappedRead { recap: unknown; slides: unknown[]; isEmpty: boolean; isLoading: boolean; isError: boolean }

const mocks = vi.hoisted(() => {
  const params: Record<string, string> = {}
  const wrapped: WrappedRead = { recap: null, slides: [], isEmpty: false, isLoading: false, isError: false }
  return { params, wrapped, useWrapped: vi.fn(), refetch: vi.fn(() => Promise.resolve()) }
})

vi.mock('react-i18next', async (original) => ({
  ...await original<typeof import('react-i18next')>(),
  useTranslation: () => ({ t: testI18n.t.bind(testI18n), i18n: testI18n }),
}))
vi.mock('expo-router', () => ({ useRootNavigationState: () => undefined, useLocalSearchParams: () => mocks.params }))
vi.mock('react-native-safe-area-context', async (original) => ({
  ...await original<typeof import('react-native-safe-area-context')>(),
  useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }),
}))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('@/hooks/use-go-back-or-fallback', () => ({ useGoBackOrFallback: () => vi.fn() }))
vi.mock('@/hooks/use-wrapped', () => ({
  useWrapped: (...args: unknown[]) => {
    mocks.useWrapped(...args)
    return { ...mocks.wrapped, refetch: mocks.refetch }
  },
}))
vi.mock('@/components/wrapped/wrapped-player', () => ({
  WrappedPlayer: (props: Record<string, unknown>) => React.createElement('WrappedPlayer', props),
}))

const HEIGHT = 915
const WIDTHS = [320, 360, 384, 412] as const
let tree: GeometryTree

async function mount(width = 360) {
  await testI18n.changeLanguage('pt-BR')
  __setWindowDimensions({ width, height: HEIGHT, scale: 1, fontScale: 1 })
  await act(() => { tree = create(<WrappedScreen />) as GeometryTree })
}

const hosts = () => tree.root.findAll((node) => typeof node.type === 'string')
const byTestId = (testID: string) => hosts().filter((node) => node.props.testID === testID)
const pressNamed = async (name: string) => {
  const target = hosts().find((node) => typeof node.props.onPress === 'function'
    && (node.props.accessibilityLabel === name || node.findAll((child) => String(child.type) === 'Text' && child.props.children === name).length > 0))!
  await act(() => { (target.props.onPress as () => void)() })
}

beforeEach(() => {
  mocks.params = {}
  mocks.useWrapped.mockClear()
  mocks.refetch.mockClear()
  mocks.wrapped = { recap: createMockRecap(), slides: [{ id: 'intro' }], isEmpty: false, isLoading: false, isError: false }
})

afterEach(async () => {
  await act(() => tree.unmount())
})

describe('the guided Wrapped screen on Android', () => {
  it.each(WIDTHS)('centres the cover block between the app bar and the start action at %i px', async (width) => {
    enableTestFlags('orbit_guided_flows')
    await mount(width)

    const boxes = measureSafeArea(tree.toJSON(), (host) => host.props.testID, { width, height: HEIGHT })
    const cover = boxes.get('wrapped-cover-ready')!
    const block = boxes.get('wrapped-cover-block')!
    const primary = boxes.get('wrapped-cover-primary')!
    const free = { top: cover.top, bottom: primary.top }
    expect(free.bottom - free.top).toBeGreaterThan(block.bottom - block.top)
    expect(Math.abs((block.top + block.bottom) / 2 - (free.top + free.bottom) / 2)).toBeLessThanOrEqual(1)
    expect(Math.abs(block.left + block.width / 2 - width / 2)).toBeLessThanOrEqual(1)
    expect(primary.bottom).toBeLessThanOrEqual(HEIGHT - 24)
  })

  it('loads the recap of the closed month from the route query, as the current screen does', async () => {
    enableTestFlags('orbit_guided_flows')
    mocks.params = { period: 'month', year: '2026', month: '10' }
    await mount()

    expect(mocks.useWrapped).toHaveBeenLastCalledWith('month', { active: false, closedMonth: { year: 2026, month: 10 } })
    expect(byTestId('wrapped-cover-block')).toHaveLength(1)
  })

  it('reads the recap again on retry after an error', async () => {
    enableTestFlags('orbit_guided_flows')
    mocks.wrapped = { recap: null, slides: [], isEmpty: false, isLoading: false, isError: true }
    await mount()

    expect(byTestId('wrapped-cover-failed')).toHaveLength(1)
    await pressNamed(ptBR.wrapped.retry)
    expect(mocks.refetch).toHaveBeenCalledTimes(1)
  })

  it('opens the player from the start action and reads another period from a quick option', async () => {
    enableTestFlags('orbit_guided_flows')
    await mount()

    await pressNamed(ptBR.wrapped.periods.year)
    expect(mocks.useWrapped).toHaveBeenLastCalledWith('year', { active: false, closedMonth: undefined })
    await pressNamed(ptBR.wrapped.start)
    expect(hosts().some((node) => String(node.type) === 'WrappedPlayer')).toBe(true)
  })
})
