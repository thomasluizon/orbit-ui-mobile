import React, { type ReactElement } from 'react'
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BottomTabBar } from '@/components/navigation/bottom-tab-bar'
import { Checkbox } from '@/components/ui/checkbox'
import { CheckRow } from '@/components/ui/check-row'
import { MotionPressable } from '@/components/ui/motion-pressable'
import { PageHeader } from '@/components/ui/page-header'
import { Select } from '@/components/ui/select'
import { Sheet } from '@/components/ui/sheet'
import { Slider } from '@/components/ui/slider'
import { Toast } from '@/components/ui/app-toast'

const motion = vi.hoisted(() => ({ pressScale: 0.91, reducedMotion: false }))

vi.mock('@orbit/shared/theme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@orbit/shared/theme')>()
  return { ...actual, orbitalMotion: { ...actual.orbitalMotion, press: { ...actual.orbitalMotion.press, scale: motion.pressScale } } }
})
vi.mock('@/lib/motion', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/motion')>(), usePrefersReducedMotion: () => motion.reducedMotion }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }) }))
vi.unmock('@/components/ui/sheet')
vi.mock('@lodev09/react-native-true-sheet', () => ({
  TrueSheet: class extends React.Component<{ children?: React.ReactNode; footer?: React.ReactNode }> {
    present = () => Promise.resolve()
    dismiss = () => Promise.resolve()
    render() { return <>{this.props.children}{this.props.footer}</> }
  },
}))

async function mount(element: ReactElement) {
  let tree!: ReactTestRenderer
  await act(() => { tree = create(element) })
  return tree
}

function host(tree: ReactTestRenderer, predicate: (props: Record<string, unknown>) => boolean) {
  return tree.root.findAll((node) => typeof node.type === 'string' && predicate(node.props))[0]!
}

/** The scales of every press layer inside the press target: the content moves, the target and its fill stay. */
function contentScales(target: ReactTestInstance) {
  return target.findAll((node) => typeof node.type === 'string' && node.props['data-slot'] === 'press-scale')
    .map((node) => (StyleSheet.flatten(node.props.style as StyleProp<ViewStyle>).transform as { scale: number }[])[0]!.scale)
}

function targetScale(target: ReactTestInstance) {
  const style = target.props.style as StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>)
  return StyleSheet.flatten(typeof style === 'function' ? style({ pressed: true }) : style).transform
}

async function press(target: ReactTestInstance, phase: 'onPressIn' | 'onPressOut') {
  await act(() => (target.props[phase] as () => void)())
}

const contentTargets = [
  { name: 'checkbox', render: () => <Checkbox label="Done" checked={false} onChange={vi.fn()} />, find: (tree: ReactTestRenderer) => host(tree, (props) => props.accessibilityRole === 'checkbox'), layers: 1 },
  { name: 'check row', render: () => <CheckRow label="Water" description="Twice" value="2" checked={false} onChange={vi.fn()} />, find: (tree: ReactTestRenderer) => host(tree, (props) => props.accessibilityLabel === 'Water'), layers: 3 },
  { name: 'column check row', render: () => <CheckRow placement="column" label="Water" value="2" checked onChange={vi.fn()} />, find: (tree: ReactTestRenderer) => host(tree, (props) => props.accessibilityLabel === 'Water'), layers: 3 },
  { name: 'tab', render: () => <BottomTabBar items={[{ id: 'today', label: 'Hoje', icon: () => <View /> }]} activeId="today" onSelect={vi.fn()} label="Navigation" />, find: (tree: ReactTestRenderer) => host(tree, (props) => props.accessibilityRole === 'tab'), layers: 2 },
  { name: 'toast action', render: () => <Toast kind="neutral" message="Deleted" actionLabel="Undo" onAction={vi.fn()} />, find: (tree: ReactTestRenderer) => host(tree, (props) => props.testID === 'toast-action'), layers: 1 },
] as const

describe.each(contentTargets)('$name press', ({ render, find, layers }) => {
  afterEach(() => { motion.reducedMotion = false })

  it('scales its content by the shared press scale while the press target keeps its size, and returns to rest', async () => {
    const tree = await mount(render())
    try {
      const target = find(tree)
      expect(contentScales(target)).toEqual(Array(layers).fill(1))
      await press(target, 'onPressIn')
      expect(contentScales(find(tree))).toEqual(Array(layers).fill(motion.pressScale))
      expect(targetScale(find(tree))).toBeUndefined()
      await press(find(tree), 'onPressOut')
      expect(contentScales(find(tree))).toEqual(Array(layers).fill(1))
    } finally { await act(() => tree.unmount()) }
  })

  it('keeps its content still under reduced motion', async () => {
    motion.reducedMotion = true
    const tree = await mount(render())
    try {
      await press(find(tree), 'onPressIn')
      expect(contentScales(find(tree))).toEqual(Array(layers).fill(1))
    } finally { await act(() => tree.unmount()) }
  })
})

it('scales the select option content inside its unscaled option', async () => {
  const tree = await mount(<Sheet open title="Reminders"><Select label="Units" value="a" options={[{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }]} onChange={vi.fn()} /></Sheet>)
  try {
    await act(() => (host(tree, (props) => props.role === 'combobox').props.onPress as () => void)())
    const option = () => host(tree, (props) => props.role === 'option' && props.accessibilityLabel === 'Beta')
    await press(option(), 'onPressIn')
    expect(contentScales(option())).toEqual([motion.pressScale])
    await press(option(), 'onPressOut')
    expect(contentScales(option())).toEqual([1])
  } finally { await act(() => tree.unmount()) }
})

it('scales the slider dot while the person holds or drags it, and releases it on release', async () => {
  const tree = await mount(<Slider label="Mood" value={2} valueText="2" min={1} max={5} step={1} onChange={vi.fn()} />)
  try {
    const track = () => host(tree, (props) => props.accessibilityLabel === 'Mood')
    expect(contentScales(track())).toEqual([1])
    await act(() => (track().props.onResponderGrant as (event: object) => void)({ nativeEvent: { locationX: 100 } }))
    expect(contentScales(track())).toEqual([motion.pressScale])
    await act(() => (track().props.onResponderRelease as () => void)())
    expect(contentScales(track())).toEqual([1])
  } finally { await act(() => tree.unmount()) }
})

it('gives the page header back control the shared press motion of the app bar back control', async () => {
  const tree = await mount(<PageHeader title="Ajuda" backLabel="Voltar" onBack={vi.fn()} />)
  try {
    expect(tree.root.findAllByType(MotionPressable).map((node) => node.props.accessibilityLabel)).toEqual(['Voltar'])
  } finally { await act(() => tree.unmount()) }
})
