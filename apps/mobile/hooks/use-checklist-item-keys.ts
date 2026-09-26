import { useLayoutEffect, useState } from 'react'
import {
  createChecklistItemKeyState,
  reconcileChecklistItemKeys,
} from '@orbit/shared/hooks'
import type { ChecklistItem } from '@orbit/shared/types/habit'

export function useChecklistItemKeys(items: ChecklistItem[]): string[] {
  const [knownKeys] = useState(() => new WeakMap<ChecklistItem, string>())
  const [state, setState] = useState(() => createChecklistItemKeyState(items))
  const current = state.items === items
    ? state
    : reconcileChecklistItemKeys(state, items, knownKeys)

  if (current !== state) setState(current)

  useLayoutEffect(() => {
    items.forEach((item, index) => knownKeys.set(item, current.keys[index]!))
  }, [items, current.keys, knownKeys])

  return current.keys
}
