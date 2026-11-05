import { useState } from 'react'

export function useRowFeedback(disabled = false) {
  const [pressed, setPressed] = useState(false)
  const [focused, setFocused] = useState(false)
  const [hovered, setHovered] = useState(false)
  return {
    pressed, focused, highlighted: !disabled && (pressed || focused || hovered),
    handlers: {
      onPressIn: () => setPressed(true), onPressOut: () => setPressed(false),
      onFocus: () => setFocused(true), onBlur: () => setFocused(false),
      onHoverIn: () => setHovered(true), onHoverOut: () => setHovered(false),
    },
  }
}
