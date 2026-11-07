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

type ControlFeedback = Readonly<{ pressed: boolean; focused: boolean; hovered: boolean; highlighted: boolean }>

export function useNestedSlotFeedback() {
  const [pressed, setPressed] = useState(false)
  const [hovered, setHovered] = useState(false)
  return {
    pressed, focused: false, hovered, highlighted: pressed || hovered,
    handlers: {
      onTouchStart: () => setPressed(true), onTouchEnd: () => setPressed(false), onTouchCancel: () => setPressed(false),
      onPointerEnter: () => setHovered(true), onPointerLeave: () => setHovered(false),
    },
  }
}

export function surfaceHighlighted(bodyHighlighted: boolean, nestedControls: readonly ControlFeedback[]) {
  const nestedUnderPointer = nestedControls.some((control) => control.pressed || control.hovered)
  const nestedFocused = nestedControls.some((control) => control.highlighted && control.focused)
  return !nestedUnderPointer && (bodyHighlighted || nestedFocused)
}

export function nestedControlFill(control: ControlFeedback, fills: Readonly<{ bgHover: string; bgRowAction: string }>) {
  if (!control.highlighted) return 'transparent'
  return control.pressed || control.hovered ? fills.bgHover : fills.bgRowAction
}
