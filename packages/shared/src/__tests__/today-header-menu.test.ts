import { describe, expect, it, vi } from 'vitest'
import { HABIT_FREQUENCY_FILTER_OPTIONS } from '../utils/habit-frequency-filter'
import { buildTodayHeaderMenuItems, selectTodayHeaderMenuItem } from '../utils/today-header-menu'

const labels = { selectLabel: 'Select', collapseLabel: 'Collapse', refreshLabel: 'Refresh', completedLabel: 'Completed', allCollapsed: false, showCompleted: false, isFetching: false }
const translate = (key: string) => key
const makeActions = () => ({ onToggleSelect: vi.fn(), onToggleCollapse: vi.fn(), onRefresh: vi.fn(), onToggleCompleted: vi.fn(), setFrequencyUnit: vi.fn(), openFrequencyMenu: vi.fn() })

describe('Hoje header menu', () => {
  it('preserves action order, toggle glyphs and refresh availability', () => {
    expect(buildTodayHeaderMenuItems(labels, false, undefined, translate)).toEqual([
      { id: 'select', label: 'Select', icon: 'checkbox' },
      { id: 'collapse', label: 'Collapse', icon: 'chevrons-up' },
      { id: 'refresh', label: 'Refresh', icon: 'refresh', disabled: false },
      { id: 'completed', label: 'Completed', icon: 'eye' },
      { id: 'frequency', label: 'habits.frequencyFilter', icon: 'adjustments-horizontal' },
    ])
    const items = buildTodayHeaderMenuItems({ ...labels, allCollapsed: true, showCompleted: true, isFetching: true }, false, undefined, translate)
    expect(items[1]?.icon).toBe('chevrons-down')
    expect(items[2]?.disabled).toBe(true)
    expect(items[3]?.icon).toBe('eye-off')
  })

  it.each(HABIT_FREQUENCY_FILTER_OPTIONS)('exposes the selected frequency $id and clears it on re-selection', ({ id, value, labelKey }) => {
    const items = buildTodayHeaderMenuItems(labels, true, value, translate)
    expect(items).toHaveLength(HABIT_FREQUENCY_FILTER_OPTIONS.length)
    expect(items.find((item) => item.id === id)).toEqual({ id, label: labelKey, checked: true })
    expect(items.filter((item) => item.checked)).toHaveLength(1)
    const actions = makeActions()
    selectTodayHeaderMenuItem(id, true, value, actions)
    expect(actions.setFrequencyUnit).toHaveBeenCalledWith(undefined)
    expect(actions.openFrequencyMenu).not.toHaveBeenCalled()
  })

  it.each([
    ['select', 'onToggleSelect'], ['collapse', 'onToggleCollapse'], ['refresh', 'onRefresh'], ['completed', 'onToggleCompleted'], ['frequency', 'openFrequencyMenu'],
  ] as const)('dispatches only the %s action', (id, callback) => {
    const actions = makeActions()
    selectTodayHeaderMenuItem(id, false, 'Week', actions)
    for (const [key, action] of Object.entries(actions)) expect(action).toHaveBeenCalledTimes(key === callback ? 1 : 0)
  })

  it('selects a different frequency without dispatching a list action and ignores unknown actions', () => {
    const actions = makeActions()
    selectTodayHeaderMenuItem('Day', true, 'Week', actions)
    expect(actions.setFrequencyUnit).toHaveBeenCalledWith('Day')
    selectTodayHeaderMenuItem('unknown', false, 'Week', actions)
    for (const action of [actions.onToggleSelect, actions.onToggleCollapse, actions.onRefresh, actions.onToggleCompleted, actions.openFrequencyMenu]) expect(action).not.toHaveBeenCalled()
  })
})
