import { useCallback, useRef } from 'react'

export function useSheetExitAction() {
  const pendingExitActionRef = useRef<(() => void) | null>(null)

  const scheduleExitAction = useCallback((action: () => void) => {
    pendingExitActionRef.current = action
  }, [])

  const runExitAction = useCallback(() => {
    const pendingExitAction = pendingExitActionRef.current
    pendingExitActionRef.current = null
    pendingExitAction?.()
  }, [])

  return { scheduleExitAction, runExitAction }
}
