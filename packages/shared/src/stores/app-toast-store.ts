import type { ToastProps } from '../contracts/feedback'

export type StoredToast = ToastProps

export interface AppToastItem {
  id: number
  toast: StoredToast
  onDismiss?: () => void
  presentation?: 'error'
}

export interface AppToastStore {
  currentToast: AppToastItem | null
  queue: AppToastItem[]
  showToast: (toast: StoredToast) => number | undefined
  showError: (message: string, dismissLabel?: string, onAction?: () => void) => number | undefined
  showSuccess: (message: string) => number | undefined
  showInfo: (message: string) => number | undefined
  showQueued: (message: string, actionLabel?: string, onAction?: () => void, onDismiss?: () => void) => number | undefined
  triggerAction: (id?: number) => void
  dismissToast: (id?: number) => void
  dismissAllToasts: () => void
}

type SetState = (updater: (state: AppToastStore) => Partial<AppToastStore>) => void
type GetState = () => AppToastStore

let toastCounter = 0

function hasRemovalPath(toast: StoredToast): boolean {
  return toast.kind === 'done'
    || toast.kind === 'lost'
    || (toast.kind === 'neutral' && Boolean(toast.actionLabel))
}

function enqueueToast(set: SetState, get: GetState, toast: StoredToast, onDismiss?: () => void, presentation?: 'error'): number | undefined {
  const message = toast.message.trim()
  if (!message) return undefined

  const state = get()
  if (!toast.onAction && [state.currentToast, state.queue.at(-1)].some((item) =>
    !item?.toast.onAction && item?.toast.message === message && item.toast.kind === toast.kind && item.presentation === presentation,
  )) return undefined

  const nextToast = { id: ++toastCounter, toast: { ...toast, message }, onDismiss, ...(presentation ? { presentation } : {}) } as AppToastItem
  let discarded: AppToastItem[] = []
  set((current) => {
    if (!current.currentToast || !hasRemovalPath(current.currentToast.toast)) {
      discarded = current.currentToast ? [current.currentToast] : []
      return { currentToast: nextToast }
    }
    const blockerIndex = current.queue.findIndex((item) => !hasRemovalPath(item.toast))
    if (blockerIndex >= 0) {
      discarded = current.queue.slice(blockerIndex)
      return { queue: [...current.queue.slice(0, blockerIndex), nextToast] }
    }
    return { queue: [...current.queue, nextToast] }
  })
  discarded.forEach((item) => item.onDismiss?.())
  return nextToast.id
}

export function createAppToastStoreState(set: SetState, get: GetState): AppToastStore {
  const dismissToast = (id?: number) => {
    const current = get().currentToast
    if (id !== undefined && current?.id !== id) {
      const queued = get().queue.find((item) => item.id === id)
      if (!queued) return
      set((state) => ({ queue: state.queue.filter((item) => item.id !== id) }))
      queued.onDismiss?.()
      return
    }
    if (!current) return
    set((state) => {
      const [nextToast, ...queue] = state.queue
      return { currentToast: nextToast ?? null, queue }
    })
    current.onDismiss?.()
  }

  return {
    currentToast: null,
    queue: [],
    showToast: (toast) => enqueueToast(set, get, toast),
    showError: (message, dismissLabel, onAction) => enqueueToast(set, get, dismissLabel
      ? { kind: 'neutral', message, actionLabel: dismissLabel, onAction: onAction ?? (() => {}) }
      : { kind: 'neutral', message }, undefined, 'error'),
    showSuccess: (message) => {
      const id = enqueueToast(set, get, { kind: 'done', message, onDone: () => dismissToast(id) })
      return id
    },
    showInfo: (message) => enqueueToast(set, get, { kind: 'neutral', message }),
    showQueued: (message, actionLabel, onAction, onDismiss) => enqueueToast(set, get,
      actionLabel && onAction
        ? { kind: 'neutral', message, actionLabel, onAction }
        : { kind: 'neutral', message },
      onDismiss,
    ),
    triggerAction: (id) => {
      const state = get()
      const current = id === undefined || state.currentToast?.id === id ? state.currentToast : state.queue.find(item => item.id === id)
      if (!current) return
      if (current.toast.kind === 'neutral' || current.toast.kind === 'lost') current.toast.onAction?.()
      dismissToast(current.id)
    },
    dismissToast,
    dismissAllToasts: () => {
      const { currentToast, queue } = get()
      set(() => ({ currentToast: null, queue: [] }))
      currentToast?.onDismiss?.()
      queue.forEach((item) => item.onDismiss?.())
    },
  }
}

export function getModalError(state: Pick<AppToastStore, 'currentToast' | 'queue'>): AppToastItem | undefined {
  return [state.currentToast, ...state.queue].find(item => item?.presentation === 'error') ?? undefined
}
