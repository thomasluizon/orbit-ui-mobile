import { useCallback, useEffect, useState } from 'react'
import { createHabitViewSearchState, updateHabitViewSearch } from '@orbit/shared/hooks'

export function useHabitViewSearch(view: string) {
  const [state, setState] = useState(() => createHabitViewSearchState(view))
  if (state.view !== view) setState(createHabitViewSearchState(view))
  useEffect(() => {
    const timer = setTimeout(() => setState((current) => updateHabitViewSearch(current, { type: 'flush', view })), 300)
    return () => clearTimeout(timer)
  }, [state.text, view])
  const close = useCallback(() => setState((current) => updateHabitViewSearch(current, { type: 'close' })), [])
  const toggle = useCallback(() => setState((current) => updateHabitViewSearch(current, { type: 'toggle' })), [])
  const changeText = useCallback((text: string) => setState((current) => updateHabitViewSearch(current, { type: 'text', text })), [])
  return { ...state, close, toggle, changeText }
}
