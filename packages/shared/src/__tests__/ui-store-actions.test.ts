import { describe, expect, it } from 'vitest'
import {
  createUIStoreState,
  migratePersistedUIState,
  type UIStoreState,
} from '../stores/ui-store'

function createStoreHarness() {
  let state = {} as UIStoreState
  const set = (
    partial:
      | Partial<UIStoreState>
      | ((current: UIStoreState) => Partial<UIStoreState>),
  ) => {
    const next = typeof partial === 'function' ? partial(state) : partial
    state = { ...state, ...next }
  }
  const get = () => state
  state = createUIStoreState(set, get)
  return {
    getState: () => state,
    setState: (patch: Partial<UIStoreState>) => {
      state = { ...state, ...patch }
    },
  }
}

describe('ui store toggles and setters', () => {
  it('adds then removes a habit id from the selection set', () => {
    const store = createStoreHarness()

    store.getState().toggleHabitSelection('h-1')
    expect(store.getState().selectedHabitIds.has('h-1')).toBe(true)

    store.getState().toggleHabitSelection('h-1')
    expect(store.getState().selectedHabitIds.has('h-1')).toBe(false)
  })

  it('selects every id and then clears the selection and select mode', () => {
    const store = createStoreHarness()

    store.getState().selectAllHabits(['h-1', 'h-2', 'h-3'])
    expect(store.getState().selectedHabitIds).toEqual(new Set(['h-1', 'h-2', 'h-3']))
    expect(store.getState().manuallySelectedIds).toEqual(new Set(['h-1', 'h-2', 'h-3']))

    store.setState({ isSelectMode: true })
    store.getState().clearSelection()
    expect(store.getState().isSelectMode).toBe(false)
    expect(store.getState().selectedHabitIds.size).toBe(0)
    expect(store.getState().manuallySelectedIds.size).toBe(0)
  })

  it('updates the modal, frequency, tag, completed and checklist flags', () => {
    const store = createStoreHarness()
    const {
      setShowCreateModal,
      setShowCreateGoalModal,
      setSelectedFrequency,
      setSelectedTagIds,
      setShowCompleted,
      setSetupChecklistDismissed,
    } = store.getState()

    setShowCreateModal(true)
    setShowCreateGoalModal(true)
    setSelectedFrequency('Week')
    setSelectedTagIds(['focus', 'health'])
    setShowCompleted(true)
    setSetupChecklistDismissed(true)

    expect(store.getState()).toMatchObject({
      showCreateModal: true,
      showCreateGoalModal: true,
      selectedFrequency: 'Week',
      selectedTagIds: ['focus', 'health'],
      showCompleted: true,
      setupChecklistDismissed: true,
    })
  })

  it('enqueues then clears the all-done celebration', () => {
    const store = createStoreHarness()

    store.getState().setAllDoneCelebration(true)
    expect(store.getState().activeCelebration?.kind).toBe('all-done')

    store.getState().setAllDoneCelebration(false)
    expect(store.getState().activeCelebration).toBeNull()
    expect(store.getState().allDoneCelebration).toBe(false)
  })

  it('skips the all-done celebration when the active filters are not today', () => {
    const store = createStoreHarness()
    store.setState({ activeFilters: { dateFrom: '2000-01-01', dateTo: '2000-01-02' } })

    store.getState().checkAllDoneCelebration(
      new Map([['h-1', { parentId: null, isCompleted: true }]]),
    )

    expect(store.getState().allDoneCelebration).toBe(false)
  })
})

describe('migratePersistedUIState frequency guard', () => {
  it('keeps a valid frequency and drops an invalid one', () => {
    expect(migratePersistedUIState({ selectedFrequency: 'Day' }).selectedFrequency).toBe('Day')
    expect(migratePersistedUIState({ selectedFrequency: 'none' }).selectedFrequency).toBe('none')
    expect(migratePersistedUIState({ selectedFrequency: 'Quarter' }).selectedFrequency).toBeNull()
    expect(migratePersistedUIState('not-an-object').selectedFrequency).toBeNull()
  })
})
