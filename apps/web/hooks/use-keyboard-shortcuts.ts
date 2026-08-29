'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { setRouteTransitionIntent } from '@/lib/motion/route-intent'
import { useShellStore } from '@/stores/shell-store'
import { useUIStore } from '@/stores/ui-store'
import { hasOpenModalFocusOwner, hasOpenOverlay } from '@/lib/overlay-stack'

const CHORD_TIMEOUT_MS = 1200

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

/**
 * Global keyboard shortcuts for the desktop shell. Cmd/Ctrl+K toggles the command
 * palette anywhere; a `g`-prefixed chord jumps to Today, Calendar, or Profile with
 * the tab-switch transition. Chords are ignored while typing in a field or while an
 * overlay is open. The command palette rebuild owns the final destination shortcut set.
 */
export function useKeyboardShortcuts(enabled = true): void {
  const router = useRouter()
  const togglePalette = useShellStore((state) => state.togglePalette)
  const paletteOpen = useShellStore((state) => state.paletteOpen)
  const setActiveView = useUIStore((state) => state.setActiveView)
  const chordArmed = useRef(false)
  const chordTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!enabled) return

    function clearChord() {
      chordArmed.current = false
      if (chordTimer.current) {
        clearTimeout(chordTimer.current)
        chordTimer.current = null
      }
    }

    function navigate(path: string, view?: 'today') {
      if (view) setActiveView(view)
      setRouteTransitionIntent('tab')
      router.push(path)
    }

    function runChord(key: string): boolean {
      switch (key) {
        case 't':
          navigate('/', 'today')
          return true
        case 'c':
          navigate('/calendar')
          return true
        case 'p':
          navigate('/profile')
          return true
        default:
          return false
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && (event.key === 'k' || event.key === 'K')) {
        event.preventDefault()
        if (!paletteOpen && hasOpenModalFocusOwner()) return
        togglePalette()
        return
      }

      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (isTypingTarget(event.target) || hasOpenOverlay()) {
        clearChord()
        return
      }

      if (chordArmed.current) {
        const handled = runChord(event.key.toLowerCase())
        clearChord()
        if (handled) event.preventDefault()
        return
      }

      if (event.key.toLowerCase() === 'g') {
        chordArmed.current = true
        chordTimer.current = setTimeout(clearChord, CHORD_TIMEOUT_MS)
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      clearChord()
    }
  }, [enabled, paletteOpen, router, togglePalette, setActiveView])
}
