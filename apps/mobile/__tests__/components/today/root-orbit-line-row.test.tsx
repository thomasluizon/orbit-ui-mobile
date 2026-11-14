import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableTestFlags } from '@orbit/shared/test-support/flag-state'
import { motionDurations } from '@orbit/shared/theme'
import { TodayAstraLine } from '@/components/today/today-astra-line'
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

beforeEach(() => { enableTestFlags('orbit_guided_flows') })
afterEach(() => { motion.reduced = false; withTimingCalls.length = 0 })

describe('the root Orbit line row on Android', () => {
  it('draws the live Orbit at 48 in the state the caller gives', () => {
    const tree = render(<TodayAstraLine text="Nada marcado nesse dia." destination="Abrir conversa" mascotState="descansando" disabled />)
    const mascot = hostByTestId(tree.root, 'orbit-mascot')
    expect(mascot.props.width).toBe(48)
    expect(mascot.props['data-orbit-face']).toBe('rig')
    expect(mascot.props['data-orbit-state']).toBe('descansando')
    expect(hostByTestId(tree.root, 'today-astra-slot').props.accessibilityState).toMatchObject({ disabled: true })
  })

  it('fades a changed sentence in on the micro duration, never the first one', () => {
    const tree = render(<TodayAstraLine text="Dia 2: tudo feito." destination="Abrir conversa" />)
    expect(withTimingCalls).toHaveLength(0)
    TestRenderer.act(() => tree.update(<TodayAstraLine text="Nada marcado nesse dia." destination="Abrir conversa" />))
    expect(withTimingCalls).toEqual([expect.objectContaining({ value: 1, config: expect.objectContaining({ duration: motionDurations.micro }) })])
  })

  it('swaps the sentence at once under reduced motion', () => {
    motion.reduced = true
    const tree = render(<TodayAstraLine text="Dia 2: tudo feito." destination="Abrir conversa" />)
    TestRenderer.act(() => tree.update(<TodayAstraLine text="Nada marcado nesse dia." destination="Abrir conversa" />))
    expect(withTimingCalls).toHaveLength(0)
    expect(hostByTestId(tree.root, 'today-astra-slot').props.accessibilityLabel).toBe('Nada marcado nesse dia.')
  })
})
