import { useState } from 'react'

export function useRowFeedback(disabled = false) {
  const [pressed, setPressed] = useState(false)
  const [focused, setFocused] = useState(false)
  const [hovered, setHovered] = useState(false)
  return {
    pressed, focused, hovered, highlighted: !disabled && (pressed || focused || hovered),
    handlers: {
      onPressIn: () => setPressed(true), onPressOut: () => setPressed(false),
      onFocus: () => setFocused(true), onBlur: () => setFocused(false),
      onHoverIn: () => setHovered(true), onHoverOut: () => setHovered(false),
    },
  }
}

type RowFeedback = ReturnType<typeof useRowFeedback>

export function surfaceHighlighted(bodyHighlighted: boolean, nestedControls: readonly RowFeedback[]) {
  const nestedUnderPointer = nestedControls.some((control) => control.pressed || control.hovered)
  const nestedFocused = nestedControls.some((control) => control.highlighted && control.focused)
  return !nestedUnderPointer && (bodyHighlighted || nestedFocused)
}
