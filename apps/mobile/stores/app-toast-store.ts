import { create } from 'zustand'
import { createAppToastStoreState, type AppToastStore, type StoredToast } from '@orbit/shared/stores'
import { triggerHaptic } from '@/lib/haptics'

export type { StoredToast }

export const useAppToastStore = create<AppToastStore>((set, get) => {
  const shared = createAppToastStoreState(set, get)
  return {
    ...shared,
    showError: (message, dismissLabel) => {
      void triggerHaptic('warning')
      return shared.showError(message, dismissLabel)
    },
    showSuccess: (message) => {
      void triggerHaptic('success')
      return shared.showSuccess(message)
    },
    showQueued: (message, actionLabel, onAction, onDismiss) => {
      void triggerHaptic('selection')
      return shared.showQueued(message, actionLabel, onAction, onDismiss)
    },
  }
})
