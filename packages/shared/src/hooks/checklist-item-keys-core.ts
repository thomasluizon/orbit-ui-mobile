import type { ChecklistItem } from '../types/habit'

export interface ChecklistItemKeyState {
  items: ChecklistItem[]
  keys: string[]
  nextKey: number
}

interface KnownItemKeys {
  get(item: ChecklistItem): string | undefined
}

const itemKey = (sequence: number) => `checklist-item-${sequence}`

export function createChecklistItemKeyState(items: ChecklistItem[]): ChecklistItemKeyState {
  return {
    items,
    keys: items.map((_, index) => itemKey(index)),
    nextKey: items.length,
  }
}

function matchingKey(
  state: ChecklistItemKeyState,
  item: ChecklistItem,
  used: Set<string | undefined>,
) {
  const match = state.items.findIndex((previous, index) =>
    !used.has(state.keys[index]) &&
    previous.text === item.text &&
    previous.isChecked === item.isChecked,
  )
  return state.keys[match]
}

export function reconcileChecklistItemKeys(
  state: ChecklistItemKeyState,
  items: ChecklistItem[],
  knownKeys: KnownItemKeys,
): ChecklistItemKeyState {
  const keys: (string | undefined)[] = items.map((item) => knownKeys.get(item))
  const used = new Set(keys)

  for (let index = 0; index < items.length; index += 1) {
    if (keys[index]) continue
    const match = matchingKey(state, items[index]!, used)
    if (match) {
      keys[index] = match
      used.add(match)
    }
  }

  for (let index = 0; index < items.length; index += 1) {
    if (keys[index]) continue
    const previousKey = state.keys[index]
    if (previousKey && !used.has(previousKey)) {
      keys[index] = previousKey
      used.add(previousKey)
    }
  }

  let nextKey = state.nextKey
  return {
    items,
    keys: keys.map((key) => key ?? itemKey(nextKey++)),
    nextKey,
  }
}
