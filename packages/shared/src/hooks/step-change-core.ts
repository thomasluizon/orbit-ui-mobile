interface StepChangeAdapters {
  useEffect: (effect: () => void | (() => void), dependencies: readonly unknown[]) => void
  useRef: <Value>(initial: Value) => { current: Value }
}

/**
 * Runs `onChange` each time `stepKey` differs from the key of the render before it. The first mount runs nothing,
 * and a return to the first key runs it as any other change does. `onChange` may return a cleanup, which runs
 * before the next change and on unmount.
 */
export function createUseStepChange({ useEffect, useRef }: StepChangeAdapters) {
  return function useStepChange(stepKey: string, onChange: () => void | (() => void)): void {
    const previous = useRef(stepKey)
    useEffect(() => {
      if (previous.current === stepKey) return
      previous.current = stepKey
      return onChange()
    }, [stepKey, onChange])
  }
}
