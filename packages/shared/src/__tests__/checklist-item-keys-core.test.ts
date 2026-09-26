import { describe, expect, it } from 'vitest'
import type { ChecklistItem } from '../types/habit'
import {
  createChecklistItemKeyState,
  reconcileChecklistItemKeys,
  type ChecklistItemKeyState,
} from '../hooks/checklist-item-keys-core'

const original: ChecklistItem[] = [
  { text: 'First', isChecked: false },
  { text: 'Second', isChecked: false },
]

function transition(
  state: ChecklistItemKeyState,
  items: ChecklistItem[],
  knownKeys: WeakMap<ChecklistItem, string>,
) {
  const next = reconcileChecklistItemKeys(state, items, knownKeys)
  items.forEach((item, index) => knownKeys.set(item, next.keys[index]!))
  return next
}

function setup() {
  const state = createChecklistItemKeyState(original)
  const knownKeys = new WeakMap<ChecklistItem, string>()
  original.forEach((item, index) => knownKeys.set(item, state.keys[index]!))
  return { state, knownKeys }
}

describe('checklist item keys', () => {
  it('restores item keys after an optimistic reorder rolls back', () => {
    const { state, knownKeys } = setup()
    const moved = transition(state, [original[1]!, original[0]!], knownKeys)
    expect(moved.keys).toEqual([state.keys[1], state.keys[0]])
    const restored = transition(moved, original, knownKeys)
    expect(restored.keys).toEqual(state.keys)
  })

  it('restores item keys after a positional removal rolls back', () => {
    const { state, knownKeys } = setup()
    const removed = transition(state, [original[1]!], knownKeys)
    expect(removed.keys).toEqual([state.keys[1]])
    const restored = transition(removed, original, knownKeys)
    expect(restored.keys).toEqual(state.keys)
  })

  it('keeps a key when an item is edited', () => {
    const { state, knownKeys } = setup()
    const edited = transition(state, [{ ...original[0]!, text: 'Edited' }, original[1]!], knownKeys)
    expect(edited.keys).toEqual(state.keys)
  })

  it('issues a new key for an added item', () => {
    const { state, knownKeys } = setup()
    const added = transition(state, [...original, { text: 'Third', isChecked: false }], knownKeys)
    expect(added.keys.slice(0, 2)).toEqual(state.keys)
    expect(new Set(added.keys).size).toBe(3)
    expect(added.nextKey).toBe(3)
  })
})
