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

export function dismissTopOverlay(reason: OverlayCloseReason): boolean {
  const topOverlay = overlayStack.at(-1)
  if (!topOverlay) return false
  topOverlay.dismiss(reason)
  return true
}
