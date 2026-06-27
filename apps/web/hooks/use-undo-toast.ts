'use client'

import { useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useAppToast } from '@/hooks/use-app-toast'

/**
 * Shows an "Undo" snackbar for a just-completed destructive action and wires the
 * web-only Ctrl/Cmd+Z shortcut to the same undo. The shortcut listener is bound
 * while the toast is visible and removed once the toast is dismissed, auto-closes,
 * or the undo fires. `message` is already localized; `performRestore` runs the undo.
 */
export function useUndoToast() {
  const t = useTranslations()
  const { showQueued, dismissToast } = useAppToast()

  return useCallback(
    (message: string, performRestore: () => void) => {
      const state: {
        toastId: string | number | undefined
        settled: boolean
        onKeyDown: ((event: KeyboardEvent) => void) | null
      } = { toastId: undefined, settled: false, onKeyDown: null }

      const cleanup = () => {
        if (state.onKeyDown) {
          window.removeEventListener('keydown', state.onKeyDown)
          state.onKeyDown = null
        }
      }

      const settle = () => {
        if (state.settled) return
        state.settled = true
        cleanup()
        if (state.toastId !== undefined) dismissToast(state.toastId)
        performRestore()
      }

      state.onKeyDown = (event: KeyboardEvent) => {
        if (
          (event.metaKey || event.ctrlKey) &&
          !event.shiftKey &&
          event.key.toLowerCase() === 'z'
        ) {
          event.preventDefault()
          settle()
        }
      }

      window.addEventListener('keydown', state.onKeyDown)
      state.toastId = showQueued(message, t('undo.action'), settle, cleanup)
    },
    [t, showQueued, dismissToast],
  )
}
