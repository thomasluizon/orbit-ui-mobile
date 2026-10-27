import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'

export function useHabitRowActivation(onActivate?: () => void, onLongPress?: () => void) {
  const gesture = useRef({ foreground: AppState.currentState === 'active', focused: true, cancelled: false })

  useEffect(() => {
    const change = AppState.addEventListener('change', (status) => {
      gesture.current.foreground = status === 'active'
      if (status !== 'active') gesture.current.cancelled = true
    })
    const blur = AppState.addEventListener('blur', () => {
      gesture.current.focused = false
      gesture.current.cancelled = true
    })
    const focus = AppState.addEventListener('focus', () => { gesture.current.focused = true })
    return () => { change.remove(); blur.remove(); focus.remove() }
  }, [])

  function available() {
    return gesture.current.foreground && gesture.current.focused
  }

  return {
    onPressIn: () => { gesture.current.cancelled = !available() },
    onPress: () => {
      if (available() && !gesture.current.cancelled) onActivate?.()
    },
    onLongPress: onLongPress ? () => {
      if (!available() || gesture.current.cancelled) return
      gesture.current.cancelled = true
      onLongPress()
    } : undefined,
  }
}
