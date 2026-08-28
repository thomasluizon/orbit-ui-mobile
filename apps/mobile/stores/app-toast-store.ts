import { create } from 'zustand'
import type { Toast } from '@/components/ui/app-toast'
import { triggerHaptic } from '@/lib/haptics'

export type StoredToast = Parameters<typeof Toast>[0]

interface AppToastItem {
  id: number
  toast: StoredToast
}

interface AppToastStore {
  currentToast: AppToastItem | null
  queue: AppToastItem[]
  showToast: (toast: StoredToast) => void
  showError: (message: string) => void
  showSuccess: (message: string) => void
  showInfo: (message: string) => void
  showQueued: (message: string, actionLabel?: string, onAction?: () => void) => void
  triggerAction: () => void
  dismissToast: () => void
}

type SetAppToastState = (
  updater: (state: AppToastStore) => Partial<AppToastStore>,
) => void

let toastCounter = 0

function createToast(toast: StoredToast): AppToastItem {
  toastCounter += 1
  return { id: toastCounter, toast }
}

function hasRemovalPath(toast: StoredToast): boolean {
  return toast.kind === 'done'
    || toast.kind === 'lost'
    || (toast.kind === 'neutral' && Boolean(toast.actionLabel))
}

function enqueueToast(
  set: SetAppToastState,
  toast: StoredToast,
) {
  const trimmedMessage = toast.message.trim()
  if (!trimmedMessage) return

  const nextToast = createToast({ ...toast, message: trimmedMessage })
  set((state) => {
    if (!state.currentToast) return { currentToast: nextToast }

    if (!hasRemovalPath(state.currentToast.toast)) {
      return { currentToast: nextToast }
    }

    const queuedBlockerIndex = state.queue.findIndex(
      (item) => !hasRemovalPath(item.toast),
    )
    if (queuedBlockerIndex >= 0) {
      return {
        queue: [...state.queue.slice(0, queuedBlockerIndex), nextToast],
      }
    }

    return { queue: [...state.queue, nextToast] }
  })
}

export const useAppToastStore = create<AppToastStore>((set) => ({
  currentToast: null,
  queue: [],
  showToast: (toast) => enqueueToast(set, toast),
  showError: (message) => {
    void triggerHaptic('warning')
    enqueueToast(set, { kind: 'neutral', message })
  },
  showSuccess: (message) => {
    void triggerHaptic('success')
    enqueueToast(set, {
      kind: 'done',
      message,
      onDone: () => useAppToastStore.getState().dismissToast(),
    })
  },
  showInfo: (message) => enqueueToast(set, { kind: 'neutral', message }),
  showQueued: (message, actionLabel, onAction) => {
    void triggerHaptic('selection')
    enqueueToast(
      set,
      actionLabel && onAction
        ? { kind: 'neutral', message, actionLabel, onAction }
        : { kind: 'neutral', message },
    )
  },
  triggerAction: () => {
    const toast = useAppToastStore.getState().currentToast?.toast
    if (toast && (toast.kind === 'neutral' || toast.kind === 'lost')) toast.onAction?.()
    useAppToastStore.getState().dismissToast()
  },
  dismissToast: () => {
    set((state) => {
      if (state.queue.length === 0) return { currentToast: null }

      const [currentToast, ...queue] = state.queue
      return { currentToast, queue }
    })
  },
}))
