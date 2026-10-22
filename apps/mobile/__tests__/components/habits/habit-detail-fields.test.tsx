import { createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { HabitDetailFields } from '@/components/habits/habit-detail-fields'
import { ListRow } from '@/components/ui/list-row'
import { GoalDetailDrawer } from '@/components/goals/goal-detail-drawer'
const { act, create } = require('react-test-renderer') as typeof import('react-test-renderer')
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }) }))
vi.mock('@/components/goals/goal-detail-drawer', () => ({ GoalDetailDrawer: (props: { goalId: string }) => createElement('GoalDetail', props) }))

describe('habit read facts', () => {
  it('retains schedule, end date and linked goal navigation without draft controls', () => {
    let tree!: import('react-test-renderer').ReactTestRenderer
    void act(() => { tree = create(<HabitDetailFields habit={createMockHabit({ endDate: '2027-01-01', linkedGoals: [{ id: 'goal-1', title: 'Read books' }] })} summary="Every day" />) })
    const rows = tree.root.findAll((node) => node.type === ListRow)
    expect(rows.some((row) => row.props.readOnly && row.props.value === 'Every day')).toBe(true)
    expect(tree.root.findAll((node) => String(node.type) === 'TextInput')).toHaveLength(0)
    void act(() => (rows.find((row) => row.props.title === 'Read books')!.props.onClick as () => void)())
    expect(tree.root.findAll((node) => node.type === GoalDetailDrawer)[0]!.props.goalId).toBe('goal-1')
    void act(() => tree.update(<></>))
  })
})
