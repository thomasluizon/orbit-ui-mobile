import { useReducer, useRef } from 'react'
import { createGoalProgressEntry, getGoalProgressEntryRequest, reduceGoalProgressEntry } from '@orbit/shared/hooks'
import type { UpdateGoalProgressRequest } from '@orbit/shared/types/goal'

export function useGoalProgressEntry(initialValue: number, targetValue: number, save: (request: UpdateGoalProgressRequest) => Promise<unknown>, refetchDetail: () => Promise<unknown>) {
  const [draft, dispatch] = useReducer(reduceGoalProgressEntry, initialValue, createGoalProgressEntry)
  const pending = useRef(false)
  const parsed = getGoalProgressEntryRequest(draft.value, draft.note, targetValue)

  async function submit() {
    if (pending.current) return false
    if (!parsed.request) {
      dispatch({ type: 'invalid' })
      return false
    }
    pending.current = true
    dispatch({ type: 'begin' })
    try {
      await save(parsed.request)
      await refetchDetail()
      return true
    } catch (failure: unknown) {
      dispatch({ type: 'failure', failure })
      return false
    } finally {
      pending.current = false
      dispatch({ type: 'finish' })
    }
  }

  return {
    ...draft, submit,
    setValue: (value: string) => dispatch({ type: 'value', value }),
    setNote: (note: string) => dispatch({ type: 'note', note }),
    errorKey: draft.submitted ? parsed.errorKey : null,
    exceedsTarget: Number(draft.value) > targetValue,
    isDirty: draft.value !== draft.initialText || draft.note.trim().length > 0,
  }
}
