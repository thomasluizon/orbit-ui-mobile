import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppToast } from '@/hooks/use-app-toast'

/**
 * Shows an "Undo" snackbar for a just-completed destructive action. `message` is
 * already localized; tapping the action runs `performRestore`. Mobile has no
 * keyboard, so unlike web there is no Ctrl/Cmd+Z binding.
 */
export function useUndoToast() {
  const { t } = useTranslation()
  const { showQueued } = useAppToast()

  return useCallback(
    (message: string, performRestore: () => void) => {
      showQueued(message, t('undo.action'), performRestore)
    },
    [t, showQueued],
  )
}
