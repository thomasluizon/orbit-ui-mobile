import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HabitDayValue } from '@orbit/shared/contracts/dates'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { HabitDetailOrbitLine } from '@/components/habits/habit-detail-orbit-line'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, values?: Record<string, string | number>) => values?.done === undefined ? key : `${key}:${values.done}` }),
}))
vi.mock('@/components/ui/orbit-mascot', () => ({ OrbitMascot: (props: Record<string, unknown>) => React.createElement('OrbitMascotProbe', props) }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))

const renderer = require('react-test-renderer') as typeof import('react-test-renderer')
type Tree = import('react-test-renderer').ReactTestRenderer

const habit = { id: 'habit-1', title: 'Read' } as NormalizedHabit
const week = (done: number): HabitDayValue[] => [...Array.from({ length: 30 - 7 }, () => 'done' as const), ...Array.from({ length: 7 }, (_, index) => (index < done ? 'done' as const : 'missed' as const))]

async function mount(element: React.ReactElement): Promise<Tree> {
  let tree!: Tree
  await renderer.act(async () => { tree = renderer.create(element); await Promise.resolve() })
  return tree
}
const row = (tree: Tree) => tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'today-orbit-slot')
const probes = (tree: Tree) => tree.root.findAll(node => (node.type as unknown) === 'OrbitMascotProbe')

afterEach(() => {
  useChatStore.getState().setDraft('')
  useUIStore.setState({ orbitConversationOpen: false })
})

describe('Android habit detail Orbit line', () => {
  it('states how many of the last 7 days the habit was done, with Orbit at 48, and opens the review conversation', async () => {
    const tree = await mount(<HabitDetailOrbitLine habit={habit} days={week(5)} />)
    expect(probes(tree)[0]!.props).toMatchObject({ size: 48, state: 'parado' })
    expect(probes(tree)[0]!.props.still).toBeUndefined()
    expect(row(tree)[0]!.props.accessibilityLabel).toBe('habits.detail.orbit.lastSevenDays:5')
    await renderer.act(() => { (row(tree)[0]!.props.onPress as () => void)() })
    expect(useUIStore.getState().orbitConversationOpen).toBe(true)
    expect(useChatStore.getState().draft).toBe('habits.detail.askOrbitSeedDefault')
  })

  it('never counts a miss: a week with nothing done shows the review label and no number', async () => {
    const tree = await mount(<HabitDetailOrbitLine habit={habit} days={week(0)} />)
    expect(row(tree)[0]!.props.accessibilityLabel).toBe('habits.detail.askOrbit')
  })


  it('shows Orbit in Pensando while the reschedule suggestion loads', async () => {
    const tree = await mount(<HabitDetailOrbitLine habit={habit} days={week(5)} thinking />)
    expect(probes(tree)[0]!.props.state).toBe('pensando')
    await renderer.act(async () => { tree.update(<HabitDetailOrbitLine habit={habit} days={week(5)} />); await Promise.resolve() })
    expect(probes(tree)[0]!.props.state).toBe('parado')
  })
})
