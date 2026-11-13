import type { ReactElement } from 'react'
import { Animated, StyleSheet } from 'react-native'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Checkbox } from '@/components/ui/checkbox'
import { CheckRow } from '@/components/ui/check-row'
import { ShellSkeleton } from '@/components/ui/shell-skeleton'
import { SkeletonFace } from '@/components/ui/skeleton'
import { CalendarSyncBoundary } from '@/app/(tabs)/calendar/_components/calendar-sync-boundary'
import { Check, RefreshCw } from '@/components/ui/icons'
import { createTokensV2 } from '@/lib/theme'

const motion = vi.hoisted(() => ({ reduced: false }))
vi.mock('@/lib/motion', async (original) => ({ ...await original<typeof import('@/lib/motion')>(), usePrefersReducedMotion: () => motion.reduced }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }) }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))

const TestRenderer = require('react-test-renderer')
const tokens = createTokensV2('purple', 'dark')

type Node = { type: unknown; props: Record<string, any>; findAll(predicate: (node: Node) => boolean): Node[]; findAllByType(type: unknown): Node[] }

function render(element: ReactElement): { root: Node; unmount(): void } {
  let tree: { root: Node; unmount(): void } | undefined
  TestRenderer.act(() => { tree = TestRenderer.create(element) })
  return tree!
}

function hosts(root: Node, testID: string) {
  return root.findAll((node) => typeof node.type === 'string' && node.props.testID === testID)
}

function expectSkeletonFace(owner: Node) {
  const faces = hosts(owner, 'skeleton-face')
  expect(faces).toHaveLength(1)
  expect(faces[0]!.props).toMatchObject({ pointerEvents: 'none', accessible: false, importantForAccessibility: 'no-hide-descendants' })
  expect(StyleSheet.flatten(faces[0]!.props.style)).toMatchObject(StyleSheet.absoluteFill)
  const block = faces[0]!.findAll((node) => typeof node.type === 'string' && StyleSheet.flatten(node.props.style)?.backgroundColor === tokens.bgWell)
  expect(block).toHaveLength(1)
}

function expectNoSpinner(root: Node) {
  expect(root.findAll((node) => node.type === 'ActivityIndicator')).toHaveLength(0)
}

afterEach(() => { motion.reduced = false; vi.restoreAllMocks() })

describe('a control that waits for its own request on Android', () => {
  it('shows the skeleton face in the checkbox and keeps a checked state visible on it', () => {
    const tree = render(<Checkbox checked onChange={vi.fn()} label="Done" loading />)
    const control = tree.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole === 'checkbox')[0]!
    expect(control.props).toMatchObject({ accessibilityLabel: 'Done', disabled: true, accessibilityState: { checked: true, disabled: true, busy: true } })
    const box = tree.root.findAll((node) => typeof node.type === 'string' && node.props['data-slot'] === 'checkbox-box')[0]!
    expect(StyleSheet.flatten(box.props.style)).toMatchObject({ backgroundColor: 'transparent', overflow: 'hidden', borderRadius: 8 })
    expectSkeletonFace(box)
    expect(tree.root.findAllByType(Check)[0]!.props.color).toBe(tokens.fg1)
    expectNoSpinner(tree.root)
    tree.unmount()
  })

  it.each([
    ['inset', <CheckRow key="inset" label="Water" checked={false} onChange={vi.fn()} loading />],
    ['column', <CheckRow key="column" placement="column" label="Water" checked onChange={vi.fn()} loading />],
    ['personal', <CheckRow key="personal" textMode="personal" onOpenLabel={vi.fn()} label="Water" checked={false} onChange={vi.fn()} loading />],
    ['calendar day', <CheckRow key="calendar" textMode="personal" variant="calendar-day" onOpenLabel={vi.fn()} label="Water" checked={false} onChange={vi.fn()} loading />],
  ])('keeps the %s check row label and shows the skeleton face on its control', (_placement, element) => {
    const tree = render(element)
    const control = tree.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole === 'checkbox')[0]!
    expect(control.props).toMatchObject({ accessibilityLabel: 'Water', disabled: true, accessibilityState: { disabled: true, busy: true } })
    expect(StyleSheet.flatten(typeof control.props.style === 'function' ? control.props.style({ pressed: false }) : control.props.style).opacity ?? 1).toBe(1)
    expectSkeletonFace(control)
    expect(tree.root.findAll((node) => node.type === 'Text' && [node.props.children].flat().includes('Water')).length).toBeGreaterThan(0)
    expectNoSpinner(tree.root)
    tree.unmount()
  })

  it('shows the skeleton face behind the calendar sync glyph while the sync runs', async () => {
    let finish!: () => void
    const onSyncNow = vi.fn(() => new Promise<void>((done) => { finish = done }))
    const tree = render(<CalendarSyncBoundary isConnected hasProAccess autoSyncState={undefined} onAutoSyncChange={vi.fn()} onSyncNow={onSyncNow} locale="en" t={((key: string) => key) as never} tokens={tokens} />)
    const control = () => tree.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityLabel === 'calendar.autoSync.syncNow')[0]!
    TestRenderer.act(() => { control().props.onPress() })
    expect(control().props).toMatchObject({ disabled: true, accessibilityState: { disabled: true, busy: true } })
    expectSkeletonFace(control())
    expect(control().findAllByType(RefreshCw)).toHaveLength(1)
    expect(StyleSheet.flatten(control().props.style).opacity).toBe(1)
    expectNoSpinner(tree.root)
    await TestRenderer.act(async () => { finish(); await Promise.resolve() })
    expect(hosts(control(), 'skeleton-face')).toHaveLength(0)
    tree.unmount()
  })

  it('covers the shell with its rows as one busy skeleton while the app prepares again', () => {
    const tree = render(<ShellSkeleton />)
    const cover = hosts(tree.root, 'shell-skeleton')[0]!
    expect(cover.props).toMatchObject({ pointerEvents: 'auto', accessibilityRole: 'progressbar', accessibilityState: { busy: true } })
    expect(StyleSheet.flatten(cover.props.style)).toMatchObject({ ...StyleSheet.absoluteFill, backgroundColor: tokens.bg })
    expect(hosts(cover, 'skeleton-unit-habit-row')).toHaveLength(3)
    expectNoSpinner(tree.root)
    tree.unmount()
  })

  it.each([false, true])('pulses the skeleton face, or holds its still tone under reduced motion: %s', (reduced) => {
    motion.reduced = reduced
    const loop = vi.spyOn(Animated, 'loop')
    const tree = render(<SkeletonFace />)
    expect(loop).toHaveBeenCalledTimes(reduced ? 0 : 1)
    const block = tree.root.findAll((node) => typeof node.type === 'string' && StyleSheet.flatten(node.props.style)?.backgroundColor === tokens.bgWell)[0]!
    const opacity = StyleSheet.flatten(block.props.style).opacity as unknown as { value: number }
    expect(opacity.value).toBe(1)
    tree.unmount()
  })
})
