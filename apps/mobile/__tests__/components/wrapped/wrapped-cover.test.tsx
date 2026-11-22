import { pressableStyle } from '@/__tests__/support/press-feedback'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RECAP_SHARE_PERIODS } from '@orbit/shared/utils'
import { StyleSheet } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { typeRoles } from '@orbit/shared/theme'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { WrappedCover } from '@/components/wrapped/wrapped-cover'

const themeState = vi.hoisted<{ mode: 'dark' | 'light' }>(() => ({ mode: 'dark' }))
vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'orange', currentTheme: themeState.mode }),
}))

const coverCopyState = vi.hoisted(() => ({ localized: false }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (coverCopyState.localized && key === 'wrapped.coverSubtitle') return ptBR.wrapped.coverSubtitle
      if (coverCopyState.localized && key === 'wrapped.empty') return ptBR.wrapped.empty
      return key
    },
  }),
}))

const TestRenderer = require('react-test-renderer')

type TestNode = {
  type: unknown
  props: Record<string, unknown>
  findAll: (predicate: (node: TestNode) => boolean) => TestNode[]
}

vi.mock('@/components/ui/pill-button', () => ({
  Button: ({ disabled, onClick, children, size = 'md', variant = 'primary' }: {
    disabled?: boolean
    onClick?: () => void
    children: React.ReactNode
    size?: string
    variant?: string
  }) => React.createElement('Button', { disabled, onPress: onClick, size, variant }, children),
  PillButton: ({ disabled, onClick, children, label, size }: {
    disabled?: boolean
    onClick?: () => void
    children: React.ReactNode
    label?: string
    size?: string
  }) => React.createElement('Button', { disabled, onPress: onClick, label, accessibilityLabel: label, size }, children),
}))
vi.mock('@/components/ui/orbit-mascot', () => ({
  OrbitMascot: () => React.createElement('OrbitMascot'),
}))
vi.mock('@/components/ui/icon', () => ({
  Icon: ({ name }: { name: string }) => React.createElement('Icon', { name }),
}))
vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ variant, rows, label }: { variant: string; rows: number; label: string }) =>
    React.createElement('Skeleton', { variant, rows, label }),
}))
vi.mock('@/components/ui/error-state', () => ({
  ErrorState: ({ message, action }: { message: string; action: React.ReactNode }) =>
    React.createElement('ErrorState', { message }, action),
}))

const tokens = new Proxy({}, { get: () => '#111111' }) as Parameters<typeof WrappedCover>[0]['tokens']

type CoverProps = Parameters<typeof WrappedCover>[0]

const baseProps: CoverProps = {
  tokens,
  period: RECAP_SHARE_PERIODS[0],
  onSelectPeriod: vi.fn(),
  state: 'ready',
  onStart: vi.fn(),
  onRetry: vi.fn(),
}

function renderCover(overrides: Partial<CoverProps> = {}) {
  let tree!: { root: TestNode; unmount: () => void }
  TestRenderer.act(() => {
    tree = TestRenderer.create(<WrappedCover {...baseProps} {...overrides} />)
  })
  return tree
}

function nodesByType(root: TestNode, type: string) {
  return root.findAll((node) => node.type === type)
}

function nodeWithChild(root: TestNode, type: string, child: string) {
  return nodesByType(root, type).find((node) => (node.props.accessibilityLabel ?? node.props.children) === child)
}

describe('mobile WrappedCover', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    coverCopyState.localized = false
    themeState.mode = 'dark'
  })

  it('renders the ready cover and starts the player', () => {
    const onSelectPeriod = vi.fn()
    const onStart = vi.fn()
    const tree = renderCover({ onSelectPeriod, onStart })

    expect(nodeWithChild(tree.root, 'Text', 'wrapped.coverTitles.week')).toBeTruthy()
    expect(nodesByType(tree.root, 'Pressable')).toHaveLength(RECAP_SHARE_PERIODS.length)
    TestRenderer.act(() => {
      ;(nodesByType(tree.root, 'Pressable')[1]!.props.onPress as () => void)()
    })
    expect(onSelectPeriod).toHaveBeenCalledWith(RECAP_SHARE_PERIODS[1])
    const start = nodeWithChild(tree.root, 'Button', 'wrapped.start')!
    expect(start.props.disabled).toBeFalsy()
    TestRenderer.act(() => {
      ;(start.props.onPress as () => void)()
    })
    expect(onStart).toHaveBeenCalledTimes(1)
  })
})
