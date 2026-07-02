'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useIsDesktop } from '@/components/goals/use-is-desktop'
import { setRouteTransitionIntent } from '@/lib/motion/route-intent'
import { useShellStore } from '@/stores/shell-store'
import { useUIStore } from '@/stores/ui-store'
import { hasOpenOverlay } from '@/lib/overlay-stack'

const CHORD_TIMEOUT_MS = 1200

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

/**
 * Global keyboard shortcuts for the desktop shell. Cmd/Ctrl+K toggles the command
 * palette anywhere; a `g`-prefixed chord (g t/c/i/a/p) jumps between the primary
 * surfaces with the tab-switch transition; `g a` opens the maximized Astra copilot
 * at md+ and routes to /chat below it. Chords are ignored while typing in a field
 * or while an overlay is open.
 */
export function useKeyboardShortcuts(): void {
  const router = useRouter()
  const togglePalette = useShellStore((state) => state.togglePalette)
  const setAstraOpen = useShellStore((state) => state.setAstraOpen)
  const setAstraMaximized = useShellStore((state) => state.setAstraMaximized)
  const setActiveView = useUIStore((state) => state.setActiveView)
  const isDesktop = useIsDesktop()
  const chordArmed = useRef(false)
  const chordTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function clearChord() {
      chordArmed.current = false
      if (chordTimer.current) {
        clearTimeout(chordTimer.current)
        chordTimer.current = null
      }
    }

    function navigate(path: string, view?: 'today' | 'goals') {
      if (view) setActiveView(view)
      setRouteTransitionIntent('tab')
      router.push(path)
    }

    function openAstra() {
      if (isDesktop) {
        setAstraOpen(true)
        setAstraMaximized(true)
        return
      }
      navigate('/chat')
    }

    function runChord(key: string): boolean {
      switch (key) {
        case 't':
          navigate('/', 'today')
          return true
        case 'c':
          navigate('/calendar')
          return true
        case 'i':
          navigate('/insights')
          return true
        case 'a':
          openAstra()
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
  }, [router, togglePalette, setActiveView, isDesktop, setAstraOpen, setAstraMaximized])
}
