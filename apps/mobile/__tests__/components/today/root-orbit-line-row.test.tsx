import type { ReactElement } from 'react'
import { StyleSheet, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { motionDurations } from '@orbit/shared/theme'
import { TodayOrbitLine } from '@/components/today/today-orbit-line'
import { withTimingCalls } from '@/test-mocks/react-native-reanimated'

const motion = vi.hoisted(() => ({ reduced: false }))
vi.mock('@/lib/motion', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/motion')>(), usePrefersReducedMotion: () => motion.reduced }))

const TestRenderer = require('react-test-renderer')

interface TestNode {
  readonly type: unknown
  readonly props: Readonly<Record<string, unknown>>
  findAll(predicate: (node: TestNode) => boolean): TestNode[]
}

function render(element: ReactElement): { root: TestNode; update(next: ReactElement): void } {
  let tree: { root: TestNode; update(next: ReactElement): void } | undefined
  TestRenderer.act(() => { tree = TestRenderer.create(element) })
  return tree!
}

function hostByTestId(root: TestNode, testID: string): TestNode {
  return root.findAll((node) => typeof node.type === 'string' && node.props.testID === testID)[0]!
}

afterEach(() => { motion.reduced = false; withTimingCalls.length = 0 })

describe('the root Orbit line row on Android', () => {
  it('draws the live Orbit at 48 in the state the caller gives', () => {
    const tree = render(<TodayOrbitLine text="Nada marcado nesse dia." destination="Abrir conversa" mascotState="descansando" disabled />)
    const mascot = hostByTestId(tree.root, 'orbit-mascot')
    expect(mascot.props.width).toBe(48)
    expect(mascot.props['data-orbit-face']).toBe('rig')
    expect(mascot.props['data-orbit-state']).toBe('descansando')
    expect(hostByTestId(tree.root, 'today-orbit-slot').props.accessibilityState).toMatchObject({ disabled: true })
  })

  it('sets the sentence in the orbit-line role, 16 over 22.4, in two lines or fewer inside a row of 48 or more', () => {
    const tree = render(<TodayOrbitLine text="Nada marcado nesse dia." destination="Abrir conversa" />)
    const sentence = tree.root.findAll((node) => node.type === 'Text' && node.props.children === 'Nada marcado nesse dia.')[0]!
    expect(StyleSheet.flatten(sentence.props.style as StyleProp<TextStyle>)).toMatchObject({ fontFamily: 'Geist_400Regular', fontSize: 16, lineHeight: 22.4 })
    expect(sentence.props.numberOfLines).toBe(2)
    expect(StyleSheet.flatten(hostByTestId(tree.root, 'today-orbit-slot').props.style as StyleProp<ViewStyle>).minHeight).toBe(48)
    const waiting = render(<TodayOrbitLine text="Nada marcado nesse dia." destination="Abrir conversa" loading />)
    expect(StyleSheet.flatten(hostByTestId(waiting.root, 'summary-skeleton').props.style as StyleProp<ViewStyle>).minHeight).toBeCloseTo(44.8)
  })

  it('fades a changed sentence in on the micro duration, never the first one', () => {
    const tree = render(<TodayOrbitLine text="Dia 2: tudo feito." destination="Abrir conversa" />)
    expect(withTimingCalls).toHaveLength(0)
    TestRenderer.act(() => tree.update(<TodayOrbitLine text="Nada marcado nesse dia." destination="Abrir conversa" />))
    expect(withTimingCalls).toEqual([expect.objectContaining({ value: 1, config: expect.objectContaining({ duration: motionDurations.micro }) })])
  })

  it('swaps the sentence at once under reduced motion', () => {
    motion.reduced = true
    const tree = render(<TodayOrbitLine text="Dia 2: tudo feito." destination="Abrir conversa" />)
    TestRenderer.act(() => tree.update(<TodayOrbitLine text="Nada marcado nesse dia." destination="Abrir conversa" />))
    expect(withTimingCalls).toHaveLength(0)
    expect(hostByTestId(tree.root, 'today-orbit-slot').props.accessibilityLabel).toBe('Nada marcado nesse dia.')
  })
})
