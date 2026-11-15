import React from 'react'
import { act, create } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createMockRecap } from '@orbit/shared/__tests__/factories'
import { enableTestFlags } from '@orbit/shared/test-support/flag-state'
import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'
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
/** The touch target height of every control with the button role below the app bar: the laid out height plus the hit slop. */
function buttonTargets(width: number) {
  const cover = tree.root.findAll((node) => typeof node.type === 'string' && typeof node.props.testID === 'string' && node.props.testID.startsWith('wrapped-cover-'))[0]!
  const names = new Set(cover.findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole === 'button').map((node) => node.props.accessibilityLabel as string | undefined))
  const slops: number[] = []
  const boxes = measureSafeArea(tree.toJSON(), (host) => {
    if (host.props.accessibilityRole !== 'button' || !names.has(host.props.accessibilityLabel)) return undefined
    slops.push((host.props as { hitSlop?: number }).hitSlop ?? 0)
    return `button-${slops.length - 1}`
  }, { width, height: HEIGHT })
  return [...boxes.values()].map((box, index) => box.bottom - box.top + slops[index]! * 2)
}

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
  const COVER_READS = {
    ready: { recap: createMockRecap(), slides: [{ id: 'intro' }], isEmpty: false, isLoading: false, isError: false },
    loading: { recap: null, slides: [], isEmpty: false, isLoading: true, isError: false },
    empty: { recap: createMockRecap(), slides: [], isEmpty: true, isLoading: false, isError: false },
    failed: { recap: null, slides: [], isEmpty: false, isLoading: false, isError: true },
  } satisfies Record<string, WrappedRead>

  it.each((['ready', 'loading', 'empty', 'failed'] as const).flatMap((state) => WIDTHS.map((width) => ({ state, width }))))(
    'centres the $state cover block in the free area above the start action at $width px', async ({ state, width }) => {
      enableTestFlags('orbit_guided_flows')
      mocks.wrapped = COVER_READS[state]
      await mount(width)

      const boxes = measureSafeArea(tree.toJSON(), (host) => host.props.testID, { width, height: HEIGHT })
      expect(boxes.has(`wrapped-cover-${state}`)).toBe(true)
      const free = boxes.get('wrapped-cover-scroll')!
      const block = boxes.get('wrapped-cover-block')!
      const primary = boxes.get('wrapped-cover-primary')
      expect(free.bottom - free.top).toBeGreaterThan(block.bottom - block.top)
      expect(Math.abs((block.top + block.bottom) / 2 - (free.top + free.bottom) / 2)).toBeLessThanOrEqual(1)
      expect(Math.abs(block.left + block.width / 2 - width / 2)).toBeLessThanOrEqual(1)
      if (state === 'ready' || state === 'loading') {
        expect(primary!.top).toBeGreaterThanOrEqual(free.bottom)
        expect(primary!.bottom).toBeLessThanOrEqual(HEIGHT - 24)
      } else expect(primary).toBeUndefined()
    })

  it.each(WIDTHS)('spans the pinned start action across the column at %i px', async (width) => {
    enableTestFlags('orbit_guided_flows')
    await mount(width)

    const boxes = measureSafeArea(tree.toJSON(), (host) => host.props.testID === 'button-primary-sm' ? 'start' : host.props.testID, { width, height: HEIGHT })
    const primary = boxes.get('wrapped-cover-primary')!
    const start = boxes.get('start')!
    expect(start.left - primary.left).toBe(16)
    expect(primary.left + primary.width - (start.left + start.width)).toBe(16)
  })

  it.each(['ready', 'loading'] as const)('centres the %s cover block in the column at 1280 px and hangs the start action 24 under it, hugging its label', async (state) => {
    enableTestFlags('orbit_guided_flows')
    if (state === 'loading') mocks.wrapped = { recap: null, slides: [], isEmpty: false, isLoading: true, isError: false }
    await mount(1280)

    const boxes = measureSafeArea(tree.toJSON(), (host) => host.props.testID === 'button-primary-sm' ? 'start' : host.props.testID, { width: 1280, height: HEIGHT })
    const scroll = boxes.get('wrapped-cover-scroll')!
    const block = boxes.get('wrapped-cover-block')!
    const start = boxes.get('start')!
    expect(Math.abs((block.top + block.bottom) / 2 - (scroll.top + scroll.bottom) / 2)).toBeLessThanOrEqual(1)
    expect(start.top - block.bottom).toBe(24)
    expect(start.width).toBeLessThan(360)
    expect(Math.abs(start.left + start.width / 2 - (block.left + block.width / 2))).toBeLessThanOrEqual(1)
  })

  it.each(WIDTHS)('gives each period option, the start action and the retry action a target of at least 48 at %i px', async (width) => {
    enableTestFlags('orbit_guided_flows')
    await mount(width)
    expect(buttonTargets(width)).toHaveLength(4)
    for (const height of buttonTargets(width)) expect(height).toBeGreaterThanOrEqual(TOUCH_TARGET_MIN)

    await act(() => tree.unmount())
    mocks.wrapped = { recap: null, slides: [], isEmpty: false, isLoading: false, isError: true }
    await mount(width)
    expect(buttonTargets(width)).toHaveLength(4)
    for (const height of buttonTargets(width)) expect(height).toBeGreaterThanOrEqual(TOUCH_TARGET_MIN)
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
