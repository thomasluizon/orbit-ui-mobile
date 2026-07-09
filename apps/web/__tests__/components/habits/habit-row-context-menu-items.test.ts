import { describe, expect, it } from 'vitest'
import { buildHabitRowContextMenuItems } from '@/components/habits/habit-row-context-menu-items'

const t = (key: string) => key
const noop = () => {}

describe('buildHabitRowContextMenuItems', () => {
  it('returns no items in select mode', () => {
    const items = buildHabitRowContextMenuItems({
      selectMode: true,
      isDone: false,
      canLog: true,
      onLog: noop,
      onSkip: noop,
      onDetail: noop,
      onEdit: noop,
      onDuplicate: noop,
      onAddSubHabit: noop,
      onDelete: noop,
      t,
    })
    expect(items).toEqual([])
  })

  it('includes every available action in order, log first and delete marked danger', () => {
    const items = buildHabitRowContextMenuItems({
      selectMode: false,
      isDone: false,
      canLog: true,
      onLog: noop,
      onSkip: noop,
      onDetail: noop,
      onEdit: noop,
      onDuplicate: noop,
      onAddSubHabit: noop,
      onDelete: noop,
      t,
    })
    expect(items.map((item) => item.key)).toEqual([
      'log',
      'skip',
      'viewDetails',
      'edit',
      'duplicate',
      'addSubHabit',
      'delete',
    ])
    expect(items.find((item) => item.key === 'delete')?.danger).toBe(true)
  })

  it('omits log when the habit is already done', () => {
    const items = buildHabitRowContextMenuItems({
      selectMode: false,
      isDone: true,
      canLog: true,
      onLog: noop,
      onSkip: noop,
      t,
    })
    expect(items.map((item) => item.key)).toEqual(['skip'])
  })

  it('omits log when logging is disabled for the date', () => {
    const items = buildHabitRowContextMenuItems({
      selectMode: false,
      isDone: false,
      canLog: false,
      onLog: noop,
      t,
    })
    expect(items).toEqual([])
  })

  it('omits actions whose handler is absent', () => {
    const items = buildHabitRowContextMenuItems({
      selectMode: false,
      isDone: false,
      canLog: true,
      onDetail: noop,
      onDelete: noop,
      t,
    })
    expect(items.map((item) => item.key)).toEqual(['viewDetails', 'delete'])
  })
})
