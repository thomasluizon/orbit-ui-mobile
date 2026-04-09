import { create } from 'zustand'

type AppToastVariant = 'error'

interface AppToastItem {
  id: number
  message: string
  variant: AppToastVariant
}

interface AppToastStore {
  currentToast: AppToastItem | null
  queue: AppToastItem[]
  showError: (message: string) => void
  dismissToast: () => void
}

let toastCounter = 0

function createToast(message: string, variant: AppToastVariant): AppToastItem {
  toastCounter += 1

  return {
    id: toastCounter,
    message,
    variant,
  }
}

export const useAppToastStore = create<AppToastStore>((set) => ({
  currentToast: null,
  queue: [],
  showError: (message) => {
    const trimmedMessage = message.trim()
    if (!trimmedMessage) return

    const nextToast = createToast(trimmedMessage, 'error')

    set((state) => {
      if (!state.currentToast) {
        return { currentToast: nextToast }
      }

      return {
        queue: [...state.queue, nextToast],
      }
    })
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
