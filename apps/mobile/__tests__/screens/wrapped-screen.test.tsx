import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WrappedScreen from '@/app/wrapped'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => ({
  params: {},
  useWrapped: vi.fn(),
}))

vi.mock('expo-router', () => ({ useLocalSearchParams: () => mocks.params }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/hooks/use-go-back-or-fallback', () => ({ useGoBackOrFallback: () => vi.fn() }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: null }) }))
vi.mock('@/hooks/use-wrapped', () => ({
  useWrapped: (...args: unknown[]) => {
    mocks.useWrapped(...args)
    return {
      recap: null, slides: [], isEmpty: false, isLoading: false,
      isError: false, refetch: vi.fn(),
    }
  },
}))
vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))
vi.mock('@/lib/theme', () => ({ createTokensV2: () => new Proxy({}, { get: () => '#111111' }) }))
vi.mock('@/components/ui/app-bar', () => ({ AppBar: () => React.createElement('AppBar') }))
vi.mock('@/app/wrapped-cover', () => ({
  WrappedCover: ({ period, onSelectPeriod }: { period: string; onSelectPeriod: (period: string) => void }) =>
    React.createElement('WrappedCover', { period, onSelectPeriod }),
}))
vi.mock('@/app/wrapped-player', () => ({ WrappedPlayer: () => React.createElement('WrappedPlayer') }))

describe('WrappedScreen', () => {
  beforeEach(() => {
    mocks.params = {}
    mocks.useWrapped.mockClear()
  })

  it('selects and requests the notified closed month on first render', () => {
    mocks.params = { wrapped: 'month', year: '2024', month: '2' }
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<WrappedScreen />) })
    expect(tree.root.findByType('WrappedCover').props.period).toBe('month')
    expect(mocks.useWrapped).toHaveBeenCalledWith('month', {
      active: false,
      closedMonth: { year: 2024, month: 2 },
    })
    TestRenderer.act(() => tree.root.findByType('WrappedCover').props.onSelectPeriod('week'))
    expect(mocks.useWrapped).toHaveBeenLastCalledWith('week', {
      active: false,
      closedMonth: null,
    })
    TestRenderer.act(() => tree.unmount())
  })

  it('selects the next notified closed month when only the params change', () => {
    mocks.params = { wrapped: 'month', year: '2024', month: '2' }
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<WrappedScreen />) })
    TestRenderer.act(() => tree.root.findByType('WrappedCover').props.onSelectPeriod('week'))
    mocks.params = { wrapped: 'month', year: '2024', month: '3' }
    TestRenderer.act(() => tree.update(<WrappedScreen />))
    expect(tree.root.findByType('WrappedCover').props.period).toBe('month')
    expect(mocks.useWrapped).toHaveBeenLastCalledWith('month', {
      active: false,
      closedMonth: { year: 2024, month: 3 },
    })
    TestRenderer.act(() => tree.unmount())
  })
})
