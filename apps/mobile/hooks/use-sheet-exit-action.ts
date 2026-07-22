import { useCallback, useRef } from 'react'

/**
 * Owns the one action (usually a navigation) that must run only after a bottom
 * sheet has finished dismissing natively. Navigating while a TrueSheet is still
 * presented requires a react-native-screens patch this app does not apply
 * (https://sheet.lodev09.com/guides/navigation); without it the wedged native
 * sheet breaks every subsequent React Native Modal until the process restarts.
 * Call `scheduleExitAction` with the navigation, close the sheet, and pass
 * `runExitAction` as the sheet's `onDidDismiss` so the action runs exactly once
 * after the native dismissal completes. Never run the action in the same tick
 * as the close.
 */
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
