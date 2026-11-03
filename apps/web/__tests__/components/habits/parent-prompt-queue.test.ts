import { describe, expect, it } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { computeParentPromptChain, type ParentPromptChain } from '@orbit/shared/utils'
import { createParentPromptQueue, transitionParentPromptQueue } from '@/components/habits/use-parent-prompt-queue'

function promptFixture(date = '2026-09-12'): ParentPromptChain {
  const root = createMockHabit({ id: 'root', scheduledDates: [date] })
  const parent = createMockHabit({ id: 'parent', parentId: root.id, scheduledDates: [date] })
  const child = createMockHabit({ id: 'child', parentId: parent.id, scheduledDates: [date] })
  const habits = [root, parent, child]
  const ancestors = computeParentPromptChain(child.id, new Map(habits.map((habit) => [habit.id, habit])), date, {
    getChildren: (id) => habits.filter((habit) => habit.parentId === id),
    isRelevantToday: () => true,
    isDueOnSelectedDate: () => true,
    skippedIds: new Set(),
    resolvedModes: new Map([[child.id, 'log']]),
  })
  return { ...ancestors[0]!, childId: child.id, date, ancestors, selectedCount: 1 }
}

describe('parent prompt transitions', () => {
  it('enqueues in order and starts a new queue for another date', () => {
    const prompt = promptFixture()
    const first = transitionParentPromptQueue(createParentPromptQueue(prompt.date), { type: 'enqueue', prompt })
    const second = { ...prompt, childId: 'another-child' }
    const queued = transitionParentPromptQueue(first, { type: 'enqueue', prompt: second })
    expect(queued.prompts).toEqual([prompt, second])
    const nextDate = promptFixture('2026-09-13')
    expect(transitionParentPromptQueue(queued, { type: 'enqueue', prompt: nextDate })).toEqual({ date: nextDate.date, prompts: [nextDate] })
  })

  it('shifts only the active date and retains the next prompt', () => {
    const prompt = promptFixture()
    const second = { ...prompt, childId: 'another-child' }
    const queue = { date: prompt.date, prompts: [prompt, second] }
    expect(transitionParentPromptQueue(queue, { type: 'shift', date: '2026-09-13' })).toBe(queue)
    expect(transitionParentPromptQueue(queue, { type: 'shift', date: prompt.date }).prompts).toEqual([second])
  })

  it('progresses the selected ancestor prefix without changing a different prompt', () => {
    const prompt = promptFixture()
    const other = { ...prompt, childId: 'another-child' }
    const queue = { date: prompt.date, prompts: [prompt, other] }
    const progressed = transitionParentPromptQueue(queue, { type: 'progress', prompt, index: 1, checked: true })
    expect(progressed.prompts[0]?.selectedCount).toBe(2)
    expect(progressed.prompts[1]).toBe(other)
    const reduced = transitionParentPromptQueue(progressed, { type: 'progress', prompt: progressed.prompts[0]!, index: 0, checked: false })
    expect(reduced.prompts[0]?.selectedCount).toBe(0)
  })

  it('clears every prompt and owns the next date', () => {
    const prompt = promptFixture()
    const queue = { date: prompt.date, prompts: [prompt] }
    expect(transitionParentPromptQueue(queue, { type: 'clear', date: '2026-09-13' })).toEqual(createParentPromptQueue('2026-09-13'))
  })
})
