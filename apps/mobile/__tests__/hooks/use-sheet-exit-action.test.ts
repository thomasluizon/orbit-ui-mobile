import React from 'react'
import { describe, expect, it, vi } from 'vitest'

import { useSheetExitAction } from '@/hooks/use-sheet-exit-action'

const TestRenderer = require('react-test-renderer')

type SheetExitAction = ReturnType<typeof useSheetExitAction>

function renderSheetExitAction() {
  const holder: { current: SheetExitAction | null } = { current: null }

  function Harness() {
    holder.current = useSheetExitAction()
    return null
  }

  TestRenderer.act(() => {
    TestRenderer.create(React.createElement(Harness))
  })

  const current = () => {
    if (!holder.current) throw new Error('Expected useSheetExitAction to initialize')
    return holder.current
  }

  return { current }
}

describe('mobile useSheetExitAction', () => {
  it('runs a scheduled action exactly once and clears it', () => {
    const action = vi.fn()
    const exit = renderSheetExitAction()

    exit.current().scheduleExitAction(action)
    exit.current().runExitAction()
    exit.current().runExitAction()

    expect(action).toHaveBeenCalledTimes(1)
  })

  it('is a no-op when run without a scheduled action', () => {
    const exit = renderSheetExitAction()

    expect(() => exit.current().runExitAction()).not.toThrow()
  })

  it('replaces a previously scheduled action instead of queueing both', () => {
    const first = vi.fn()
    const second = vi.fn()
    const exit = renderSheetExitAction()

    exit.current().scheduleExitAction(first)
    exit.current().scheduleExitAction(second)
    exit.current().runExitAction()

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })
})
