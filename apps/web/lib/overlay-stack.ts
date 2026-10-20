'use client'

export type OverlayCloseReason =
  | 'escape'
  | 'backdrop'
  | 'close-button'
  | 'navigation'
  | 'system-back'

interface OverlayEntry {
  id: string
  dismiss: (reason: OverlayCloseReason) => void
}

const overlayStack: OverlayEntry[] = []
const modalFocusOwnerStack: string[] = []
const modalFocusOwnerListeners = new Set<() => void>()

function getOverlayIndex(id: string): number {
  return overlayStack.findIndex((entry) => entry.id === id)
}

export function registerOverlay(entry: OverlayEntry): void {
  const index = getOverlayIndex(entry.id)
  if (index >= 0) {
    overlayStack[index] = entry
    return
  }

  overlayStack.push(entry)
}

export function unregisterOverlay(id: string): void {
  const index = getOverlayIndex(id)
  if (index >= 0) {
    overlayStack.splice(index, 1)
  }
}

export function isTopOverlay(id: string): boolean {
  return overlayStack.at(-1)?.id === id
}

export function hasOpenOverlay(): boolean {
  return overlayStack.length > 0
}

function notifyModalFocusOwnerListeners(): void {
  for (const listener of modalFocusOwnerListeners) listener()
}

export function registerModalFocusOwner(id: string): void {
  if (modalFocusOwnerStack.includes(id)) return
  modalFocusOwnerStack.push(id)
  notifyModalFocusOwnerListeners()
}

export function unregisterModalFocusOwner(id: string): void {
  const index = modalFocusOwnerStack.indexOf(id)
  if (index < 0) return
  modalFocusOwnerStack.splice(index, 1)
  notifyModalFocusOwnerListeners()
}

export function isTopModalFocusOwner(id: string): boolean {
  return modalFocusOwnerStack.at(-1) === id
}

export function hasOpenModalFocusOwner(): boolean {
  return modalFocusOwnerStack.length > 0
}

export function subscribeToModalFocusOwners(listener: () => void): () => void {
  modalFocusOwnerListeners.add(listener)
  return () => modalFocusOwnerListeners.delete(listener)
}

export function dismissTopOverlay(reason: OverlayCloseReason): boolean {
  const topOverlay = overlayStack.at(-1)
  if (!topOverlay) return false
  topOverlay.dismiss(reason)
  return true
}
