import { describe, expect, it } from 'vitest'
import { createUIStoreState, type UIStoreState } from '../stores/ui-store'
import { collectSelectableDescendantIds } from '../utils/habits'

function createStore() {
  let state = {} as UIStoreState
  const set = (patch: Partial<UIStoreState> | ((current: UIStoreState) => Partial<UIStoreState>)) => {
    state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }
  }
  const get = () => state
  state = createUIStoreState(set, get)
  return () => state
}

const children = new Map([
  ['parent', ['childA', 'childB']],
  ['childA', ['grandchild']],
])
const getDescendantIds = (id: string) =>
  collectSelectableDescendantIds(id, (parentId) => children.get(parentId) ?? [])

describe('cascade selection unselect', () => {
  it('unselects and restores a child selected through its parent', () => {
    const getState = createStore()
    getState().toggleSelectMode()
    getState().toggleSelectionCascade('parent', getDescendantIds)
    expect(getState().selectedHabitIds).toEqual(new Set(['parent', 'childA', 'childB', 'grandchild']))

    getState().toggleSelectionCascade('childA', getDescendantIds)
    expect(getState().selectedHabitIds).toEqual(new Set(['parent', 'childB']))
    expect(getState().manuallySelectedIds).toEqual(new Set(['parent']))

    getState().toggleSelectionCascade('childA', getDescendantIds)
    expect(getState().selectedHabitIds).toEqual(new Set(['parent', 'childA', 'childB', 'grandchild']))
  })

  it('keeps manually picked descendants when their parent is excluded', () => {
    const getState = createStore()
    getState().toggleSelectMode()
    getState().toggleSelectionCascade('parent', getDescendantIds)
    getState().toggleSelectionCascade('grandchild', getDescendantIds)
    expect(getState().selectedHabitIds).toEqual(new Set(['parent', 'childA', 'childB']))
    getState().toggleSelectionCascade('grandchild', getDescendantIds)
    getState().toggleSelectionCascade('childA', getDescendantIds)

    expect(getState().selectedHabitIds).toEqual(new Set(['parent', 'childB', 'grandchild']))
    expect(getState().manuallySelectedIds).toEqual(new Set(['parent', 'grandchild']))

    getState().toggleSelectionCascade('parent', getDescendantIds)
    expect(getState().selectedHabitIds).toEqual(new Set(['grandchild']))
  })

  it('resets exclusions after the parent is toggled off and on', () => {
    const getState = createStore()
    getState().toggleSelectMode()
    getState().toggleSelectionCascade('parent', getDescendantIds)
    getState().toggleSelectionCascade('childA', getDescendantIds)
    getState().toggleSelectionCascade('parent', getDescendantIds)
    getState().toggleSelectionCascade('parent', getDescendantIds)

    expect(getState().selectedHabitIds).toEqual(new Set(['parent', 'childA', 'childB', 'grandchild']))
    expect(getState().manuallySelectedIds).toEqual(new Set(['parent']))
  })

  it('allows one child to be excluded after select all', () => {
    const getState = createStore()
    getState().selectAllHabits(['parent', 'childA', 'childB', 'grandchild'])
    getState().toggleSelectionCascade('childB', getDescendantIds)

    expect(getState().selectedHabitIds).toEqual(new Set(['parent', 'childA', 'grandchild']))
  })
})
