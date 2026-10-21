import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'

function allowChange<Arguments extends unknown[]>(action: (...arguments_: Arguments) => void) {
  return action
}

const HabitFormInteractionContext = createContext({
  disabled: false,
  isDisabled: (): boolean => false,
  guard: allowChange,
})

export function HabitFormInteractionProvider({ disabled, children }: Readonly<{ disabled: boolean; children: ReactNode }>) {
  const disabledRef = useRef(disabled)
  useLayoutEffect(() => { disabledRef.current = disabled }, [disabled])
  const isDisabled = useCallback(() => disabledRef.current, [])
  const guard = useCallback(<Arguments extends unknown[],>(action: (...arguments_: Arguments) => void) =>
    (...arguments_: Arguments) => { if (!disabledRef.current) action(...arguments_) }, [])
  const interaction = useMemo(() => ({ disabled, isDisabled, guard }), [disabled, guard, isDisabled])
  return <HabitFormInteractionContext value={interaction}>{children}</HabitFormInteractionContext>
}

export function useHabitFormInteraction() {
  return useContext(HabitFormInteractionContext)
}
