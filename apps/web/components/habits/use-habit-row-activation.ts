'use client'

import { useEffect, useRef, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'

export function useHabitRowActivation(onActivate: () => void) {
  const gesture = useRef({ focused: true, cancelled: false, pointer: null as number | null, released: false, space: false })

  function cancel() {
    Object.assign(gesture.current, { cancelled: true, pointer: null, released: false, space: false })
  }

  useEffect(() => {
    const blur = () => { gesture.current.focused = false; cancel() }
    const focus = () => { gesture.current.focused = true }
    const visibility = () => { if (document.visibilityState === 'hidden') cancel() }
    window.addEventListener('blur', blur)
    window.addEventListener('focus', focus)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      window.removeEventListener('blur', blur)
      window.removeEventListener('focus', focus)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [])

  function available() {
    return gesture.current.focused && document.visibilityState !== 'hidden'
  }

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    cancel()
    if (available() && document.hasFocus() && event.button === 0 && !modified(event)) {
      gesture.current.pointer = event.pointerId
    }
  }

  function onPointerUp(event: PointerEvent<HTMLButtonElement>) {
    const completed = gesture.current.pointer === event.pointerId && available() && document.hasFocus() && event.button === 0 && !modified(event)
    gesture.current.pointer = null
    gesture.current.released = completed
    gesture.current.cancelled = !completed
  }

  function onClick(event: MouseEvent<HTMLButtonElement>) {
    const accepted = available() && !gesture.current.cancelled && !modified(event) && (event.detail === 0 || gesture.current.released)
    gesture.current.released = false
    if (accepted) onActivate()
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') { cancel(); return }
    event.preventDefault()
    if (!available() || modified(event) || event.currentTarget !== document.activeElement) { cancel(); return }
    if (event.repeat) return
    cancel()
    if (event.key === 'Enter') onActivate()
    else gesture.current.space = true
  }

  function onKeyUp(event: KeyboardEvent<HTMLButtonElement>) {
    const completed = gesture.current.space && event.key === ' ' && available() && !modified(event) && event.currentTarget === document.activeElement
    cancel()
    if (event.key === ' ') event.preventDefault()
    if (completed) onActivate()
  }

  return { onPointerDown, onPointerUp, onPointerCancel: cancel, onBlur: cancel, onClick, onKeyDown, onKeyUp }
}

function modified(event: { altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) {
  return event.altKey || event.ctrlKey || event.metaKey || event.shiftKey
}
