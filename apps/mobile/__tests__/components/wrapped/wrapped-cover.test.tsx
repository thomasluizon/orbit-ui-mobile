import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RECAP_SHARE_PERIODS } from '@orbit/shared/utils'
import { WrappedCover } from '@/components/wrapped/wrapped-cover'

const TestRenderer = require('react-test-renderer')

type TestNode = {
  type: unknown
  props: Record<string, unknown>
  findAll: (predicate: (node: TestNode) => boolean) => TestNode[]
}

vi.mock('@/components/gamification/ring-motif', () => ({
  RingMotif: ({ eyebrow, anchor }: { eyebrow: string; anchor: React.ReactNode }) =>
    React.createElement('RingMotif', { eyebrow }, anchor),
}))
vi.mock('@/components/ui/chip', () => ({
  Chip: ({ active, onPress, children, accessibilityLabel }: {
    active?: boolean
    onPress?: () => void
    children: React.ReactNode
    accessibilityLabel?: string
  }) => React.createElement('Chip', { active, onPress, accessibilityLabel }, children),
}))
vi.mock('@/components/ui/pill-button', () => ({
  Button: ({ disabled, onClick, children, size = 'md', variant = 'primary' }: {
    disabled?: boolean
    onClick?: () => void
    children: React.ReactNode
    size?: string
    variant?: string
  }) => React.createElement('Button', { disabled, onPress: onClick, size, variant }, children),
  PillButton: ({ disabled, onClick, children }: {
    disabled?: boolean
    onClick?: () => void
    children: React.ReactNode
  }) => React.createElement('Button', { disabled, onPress: onClick }, children),
}))
vi.mock('@/components/ui/orbit-mark', () => ({
  OrbitMark: () => React.createElement('OrbitMark'),
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
  topInset: 0,
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
  return nodesByType(root, type).find((node) => node.props.children === child)
}

describe('mobile WrappedCover', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the ready cover and starts the player', () => {
    const onSelectPeriod = vi.fn()
    const onStart = vi.fn()
    const tree = renderCover({ onSelectPeriod, onStart })

    expect(nodeWithChild(tree.root, 'Text', 'wrapped.coverTitles.week')).toBeTruthy()
    expect(nodesByType(tree.root, 'Chip')).toHaveLength(RECAP_SHARE_PERIODS.length)
    TestRenderer.act(() => {
      ;(nodesByType(tree.root, 'Chip')[1]!.props.onPress as () => void)()
    })
    expect(onSelectPeriod).toHaveBeenCalledWith(RECAP_SHARE_PERIODS[1])
    const start = nodeWithChild(tree.root, 'Button', 'wrapped.start')!
    expect(start.props.disabled).toBeFalsy()
    TestRenderer.act(() => {
      ;(start.props.onPress as () => void)()
    })
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('renders the loading treatment without a Start action', () => {
    const tree = renderCover({ state: 'loading' })

    expect(nodesByType(tree.root, 'Skeleton')[0]?.props).toMatchObject({
      variant: 'settings',
      rows: 3,
      label: 'wrapped.loading',
    })
    expect(nodeWithChild(tree.root, 'Button', 'wrapped.start')).toBeUndefined()
  })

  it('renders the failed treatment and retries without showing Start', () => {
    const onRetry = vi.fn()
    const tree = renderCover({ state: 'failed', onRetry })

    expect(nodesByType(tree.root, 'ErrorState')[0]?.props.message).toBe('wrapped.error')
    const retry = nodeWithChild(tree.root, 'Button', 'wrapped.retry')!
    expect(retry.props.size).toBe('sm')
    TestRenderer.act(() => {
      ;(retry.props.onPress as () => void)()
    })
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(nodeWithChild(tree.root, 'Button', 'wrapped.start')).toBeUndefined()
  })

  it('renders the empty reason with a satellite and a visible disabled Start action', () => {
    const tree = renderCover({ state: 'empty' })

    expect(nodeWithChild(tree.root, 'Text', 'wrapped.empty')).toBeTruthy()
    expect(nodesByType(tree.root, 'Icon')[0]?.props.name).toBe('satellite')
    expect(nodeWithChild(tree.root, 'Button', 'wrapped.start')?.props.disabled).toBe(true)
  })
})
