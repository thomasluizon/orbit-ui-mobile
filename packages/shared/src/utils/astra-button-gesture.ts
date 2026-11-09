import { ASTRA_DRAG_THRESHOLD, clampAstraButton, type AstraButtonArea, type AstraButtonPoint } from './astra-button-position'

export type AstraButtonGesture =
  | { phase: 'rest' }
  | { phase: 'pressed'; pointer: AstraButtonPoint; origin: AstraButtonPoint }
  | { phase: 'dragging'; pointer: AstraButtonPoint; origin: AstraButtonPoint; point: AstraButtonPoint }
  | { phase: 'settled'; point: AstraButtonPoint }

export type AstraButtonGestureEvent =
  | { type: 'press'; pointer: AstraButtonPoint; origin: AstraButtonPoint }
  | { type: 'move'; pointer: AstraButtonPoint }
  | { type: 'release'; pointer: AstraButtonPoint }
  | { type: 'cancel' }

export const ASTRA_BUTTON_AT_REST: AstraButtonGesture = { phase: 'rest' }

function follow(pointer: AstraButtonPoint, start: AstraButtonPoint, origin: AstraButtonPoint, area: AstraButtonArea) {
  return clampAstraButton({ x: origin.x + pointer.x - start.x, y: origin.y + pointer.y - start.y }, area)
}

/** The press supplies the displayed origin, so every later transition is synchronous. */
export function advanceAstraButtonGesture(gesture: AstraButtonGesture, event: AstraButtonGestureEvent, area: AstraButtonArea): AstraButtonGesture {
  if (event.type === 'press') return { phase: 'pressed', pointer: event.pointer, origin: event.origin }
  if (event.type === 'cancel') return ASTRA_BUTTON_AT_REST
  if (gesture.phase !== 'pressed' && gesture.phase !== 'dragging') return gesture
  const moved = gesture.phase === 'dragging'
    || Math.hypot(event.pointer.x - gesture.pointer.x, event.pointer.y - gesture.pointer.y) >= ASTRA_DRAG_THRESHOLD
  if (!moved) return event.type === 'release' ? ASTRA_BUTTON_AT_REST : gesture
  const point = follow(event.pointer, gesture.pointer, gesture.origin, area)
  return event.type === 'release' ? { phase: 'settled', point } : { phase: 'dragging', pointer: gesture.pointer, origin: gesture.origin, point }
}
