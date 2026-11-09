import { describe, expect, it } from 'vitest'
import { ASTRA_BUTTON_AT_REST, advanceAstraButtonGesture, type AstraButtonGesture, type AstraButtonGestureEvent } from '../utils/astra-button-gesture'

const area = { width: 412, height: 600, column: { start: 0, end: 412 } }
const press: AstraButtonGestureEvent = { type: 'press', pointer: { x: 366, y: 470 }, origin: { x: 336, y: 440 } }

function run(...events: AstraButtonGestureEvent[]) {
  return events.reduce<AstraButtonGesture>((gesture, event) => advanceAstraButtonGesture(gesture, event, area), ASTRA_BUTTON_AT_REST)
}

describe('Astra button gesture', () => {
  it('stays pressed below the 8px threshold and returns to rest on release so the tap opens Astra', () => {
    expect(run(press, { type: 'move', pointer: { x: 371, y: 474 } })).toEqual({ phase: 'pressed', pointer: press.pointer, origin: press.origin })
    expect(run(press, { type: 'move', pointer: { x: 371, y: 474 } }, { type: 'release', pointer: { x: 371, y: 474 } })).toEqual(ASTRA_BUTTON_AT_REST)
  })

  it('drags from the first move that crosses the threshold and keeps following below it', () => {
    expect(run(press, { type: 'move', pointer: { x: 366, y: 478 } })).toMatchObject({ phase: 'dragging', point: { x: 336, y: 448 } })
    expect(run(press, { type: 'move', pointer: { x: 366, y: 478 } }, { type: 'move', pointer: { x: 365, y: 471 } })).toMatchObject({ phase: 'dragging', point: { x: 335, y: 441 } })
  })

  it('settles a drag on release, including a release that crosses the threshold without a move', () => {
    expect(run(press, { type: 'move', pointer: { x: 200, y: 300 } }, { type: 'release', pointer: { x: 116, y: 270 } })).toEqual({ phase: 'settled', point: { x: 86, y: 240 } })
    expect(run(press, { type: 'release', pointer: { x: 116, y: 270 } })).toEqual({ phase: 'settled', point: { x: 86, y: 240 } })
  })

  it('keeps every drag point inside the area and above the floor', () => {
    expect(run(press, { type: 'move', pointer: { x: -500, y: 4000 } })).toMatchObject({ point: { x: 16, y: 524 } })
    expect(run(press, { type: 'move', pointer: { x: 4000, y: -500 } })).toMatchObject({ point: { x: 336, y: 16 } })
  })

  it('starts each press fresh after a tap, a drag, a cancel or a press that never ended', () => {
    const second: AstraButtonGestureEvent = { type: 'press', pointer: { x: 46, y: 46 }, origin: { x: 16, y: 16 } }
    const fromStates = [
      run(press, { type: 'release', pointer: press.pointer }),
      run(press, { type: 'move', pointer: { x: 100, y: 100 } }, { type: 'release', pointer: { x: 100, y: 100 } }),
      run(press, { type: 'move', pointer: { x: 100, y: 100 } }, { type: 'cancel' }),
      run(press, { type: 'move', pointer: { x: 100, y: 100 } }),
    ]
    for (const state of fromStates) {
      const next = [second, { type: 'move', pointer: { x: 46, y: 126 } } as const].reduce((gesture, event) => advanceAstraButtonGesture(gesture, event, area), state)
      expect(next).toMatchObject({ phase: 'dragging', point: { x: 16, y: 96 } })
    }
  })

  it('ignores moves and releases without a press', () => {
    expect(run({ type: 'move', pointer: { x: 0, y: 0 } }, { type: 'release', pointer: { x: 0, y: 0 } })).toEqual(ASTRA_BUTTON_AT_REST)
    const settled = run(press, { type: 'release', pointer: { x: 116, y: 270 } })
    expect(advanceAstraButtonGesture(settled, { type: 'move', pointer: { x: 0, y: 0 } }, area)).toBe(settled)
  })
})
