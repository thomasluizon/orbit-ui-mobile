'use client'

import { useLayoutEffect, type RefObject } from 'react'

const subscriptions = new WeakMap<VisualViewport, {
  listeners: Set<() => void>
  cleanup: () => void
}>()

export function subscribeKeyboardViewport(viewport: VisualViewport, listener: () => void) {
  let subscription = subscriptions.get(viewport)
  if (!subscription) {
    const listeners = new Set<() => void>()
    const notify = () => listeners.forEach(callback => callback())
    // eslint-disable-next-line local/no-scroll-listener-motion -- Keyboard panning updates DOM clearance without driving React state https://github.com/thomasluizon/orbit-tickets/issues/1907
    viewport.addEventListener('scroll', notify)
    viewport.addEventListener('resize', notify)
    subscription = {
      listeners,
      cleanup: () => {
        viewport.removeEventListener('scroll', notify)
        viewport.removeEventListener('resize', notify)
      },
    }
    subscriptions.set(viewport, subscription)
  }
  subscription.listeners.add(listener)
  return () => {
    subscription.listeners.delete(listener)
    if (subscription.listeners.size) return
    subscriptions.delete(viewport)
    subscription.cleanup()
  }
}

export function needsKeyboardViewportResize(viewport: VisualViewport) {
  return viewport.scale === 1 && viewport.height < document.documentElement.clientHeight
}

function revealField(root: HTMLElement, viewport: VisualViewport) {
  const field = root.ownerDocument.activeElement
  if (!(field instanceof HTMLElement) || !root.contains(field)
    || !field.matches('input, textarea, [contenteditable="true"]')) return
  for (let parent = field.parentElement; parent && root.contains(parent); parent = parent.parentElement) {
    if (!/(auto|scroll)/.test(getComputedStyle(parent).overflowY)) continue
    const bounds = field.getBoundingClientRect()
    const container = parent.getBoundingClientRect()
    const top = Math.max(container.top + parent.clientTop, viewport.offsetTop) + 24
    const bottom = Math.min(
      container.top + parent.clientTop + parent.clientHeight,
      viewport.offsetTop + viewport.height,
    ) - 24
    const delta = bounds.top < top || bounds.height > bottom - top
      ? bounds.top - top
      : Math.max(0, bounds.bottom - bottom)
    parent.scrollTop = Math.max(0, parent.scrollTop + (delta < 0 ? Math.floor(delta) : Math.ceil(delta)))
  }
}

export function useKeyboardViewport(rootRef: RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const root = rootRef.current
    const viewport = window.visualViewport
    if (!root || !viewport) return
    const update = () => {
      const resize = needsKeyboardViewportResize(viewport)
      root.style.height = resize ? `${viewport.height}px` : ''
      root.style.minHeight = resize ? `${viewport.height}px` : ''
      if (resize) {
        root.style.setProperty('--keyboard-viewport-height', `${viewport.height}px`)
      } else {
        root.style.removeProperty('--keyboard-viewport-height')
      }
      if (resize) revealField(root, viewport)
    }
    const observer = new ResizeObserver(update)
    const focus = (event: FocusEvent) => {
      observer.disconnect()
      observer.observe(root)
      if (event.target instanceof HTMLElement) observer.observe(event.target)
      update()
    }
    update()
    const unsubscribe = subscribeKeyboardViewport(viewport, update)
    root.addEventListener('focusin', focus)
    return () => {
      unsubscribe()
      observer.disconnect()
      root.removeEventListener('focusin', focus)
      root.style.height = ''
      root.style.minHeight = ''
      root.style.removeProperty('--keyboard-viewport-height')
    }
  }, [rootRef])
}
