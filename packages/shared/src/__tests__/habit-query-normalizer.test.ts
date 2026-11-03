import { expect, it } from 'vitest'
import { QueryClient, QueryObserver } from '@tanstack/query-core'
import { createHabitQueryNormalizer } from '../utils/habit-normalization'
import { createMockHabitScheduleChild, createMockHabitScheduleItem } from './factories'

it('settles nested optimistic selections before the query observer commits a cached key', () => {
  const client = new QueryClient()
  const initial = [createMockHabitScheduleItem({ children: [createMockHabitScheduleChild({ id: 'child', title: 'Before' })] })]
  const next = [{ ...initial[0]!, children: [{ ...initial[0]!.children[0]!, title: 'After' }] }]
  client.setQueryData(['initial'], initial)
  client.setQueryData(['next'], next)
  const select = createHabitQueryNormalizer()
  const observer = new QueryObserver(client, { queryKey: ['initial'], select })
  const options = client.defaultQueryOptions({ queryKey: ['next'], select })
  try {
    const first = observer.getOptimisticResult(options).data!
    const repeated = observer.getOptimisticResult(options).data!
    expect(first.habitsById.get('child')!.title).toBe('After')
    expect(repeated.habitsById.get('child')).toBe(first.habitsById.get('child'))
    expect(select(initial).habitsById.get('child')!.title).toBe('Before')
    expect(select([]).topLevelHabits).toEqual([])
  } finally {
    observer.destroy()
    client.clear()
  }
})
