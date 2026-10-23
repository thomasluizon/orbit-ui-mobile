import type { StateHook, StateUpdate } from '../hooks/state-adapter'

export function createHookStateHarness(): { useState: StateHook; render: <Result>(hook: () => Result) => Result } {
  const slots: unknown[] = []
  let cursor = 0
  const useState: StateHook = <State>(initial: State | (() => State)) => {
    const index = cursor++
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? (initial as () => State)() : initial
    return [slots[index] as State, (update: StateUpdate<State>) => {
      slots[index] = typeof update === 'function' ? (update as (current: State) => State)(slots[index] as State) : update
    }]
  }
  return { useState, render: <Result>(hook: () => Result): Result => { cursor = 0; return hook() } }
}
