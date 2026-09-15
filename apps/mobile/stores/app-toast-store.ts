import { create } from 'zustand'
import { triggerHaptic } from '@/lib/haptics'

type AppToastVariant = 'error' | 'success' | 'info' | 'queued'

interface AppToastItem {
  id: number
  message: string
  variant: AppToastVariant
  actionLabel?: string
  onAction?: () => void
}

interface AppToastStore {
  currentToast: AppToastItem | null
  queue: AppToastItem[]
  showToast: (toast: Omit<AppToastItem, 'id'>) => void
  showError: (message: string) => void
  showSuccess: (message: string) => void
  showInfo: (message: string) => void
  showQueued: (message: string, actionLabel?: string, onAction?: () => void) => void
  triggerAction: () => void
  dismissToast: () => void
}

let toastCounter = 0

function createToast(
  message: string,
  variant: AppToastVariant,
  actionLabel?: string,
  onAction?: () => void,
): AppToastItem {
  toastCounter += 1

  return {
    id: toastCounter,
    message,
    variant,
    actionLabel,
    onAction,
  }
}

function isDuplicateToast(state: AppToastStore, toast: AppToastItem): boolean {
  if (toast.onAction) return false
  return [state.currentToast, state.queue.at(-1)].some(
    (item) =>
      !item?.onAction &&
      item?.message === toast.message &&
      item.variant === toast.variant,
  )
}

export const useAppToastStore = create<AppToastStore>((set) => ({
  currentToast: null,
  queue: [],
  showToast: (toast) => {
    const trimmedMessage = toast.message.trim()
    if (!trimmedMessage) return

    const nextToast = createToast(
      trimmedMessage,
      toast.variant,
      toast.actionLabel,
      toast.onAction,
    )

    set((state) => {
      if (isDuplicateToast(state, nextToast)) return state
      if (!state.currentToast) {
        return { currentToast: nextToast }
      }

      return {
        queue: [...state.queue, nextToast],
      }
    })
  },
  showError: (message) =>
    set((state) => {
      const trimmedMessage = message.trim()
      if (!trimmedMessage) return state

      void triggerHaptic('warning')
      const nextToast = createToast(trimmedMessage, 'error')
      if (isDuplicateToast(state, nextToast)) return state
      if (!state.currentToast) return { ...state, currentToast: nextToast }
      return { ...state, queue: [...state.queue, nextToast] }
    }),
  showSuccess: (message) =>
    set((state) => {
      const trimmedMessage = message.trim()
      if (!trimmedMessage) return state

      void triggerHaptic('success')
      const nextToast = createToast(trimmedMessage, 'success')
      if (isDuplicateToast(state, nextToast)) return state
      if (!state.currentToast) return { ...state, currentToast: nextToast }
      return { ...state, queue: [...state.queue, nextToast] }
    }),
  showInfo: (message) =>
    set((state) => {
      const trimmedMessage = message.trim()
      if (!trimmedMessage) return state

      const nextToast = createToast(trimmedMessage, 'info')
      if (isDuplicateToast(state, nextToast)) return state
      if (!state.currentToast) return { ...state, currentToast: nextToast }
      return { ...state, queue: [...state.queue, nextToast] }
    }),
  showQueued: (message, actionLabel, onAction) =>
    set((state) => {
      const trimmedMessage = message.trim()
      if (!trimmedMessage) return state

      void triggerHaptic('selection')
      const nextToast = createToast(trimmedMessage, 'queued', actionLabel, onAction)
      if (isDuplicateToast(state, nextToast)) return state
      if (!state.currentToast) return { ...state, currentToast: nextToast }
      return { ...state, queue: [...state.queue, nextToast] }
    }),
  triggerAction: () => {
    const action = useAppToastStore.getState().currentToast?.onAction
    action?.()
    useAppToastStore.getState().dismissToast()
  },
  dismissToast: () => {
    set((state) => {
      if (state.queue.length === 0) {
        return {
          currentToast: null,
        }
      }

      const [nextToast, ...remainingQueue] = state.queue

      return {
        currentToast: nextToast,
        queue: remainingQueue,
      }
    })
  },
}))
