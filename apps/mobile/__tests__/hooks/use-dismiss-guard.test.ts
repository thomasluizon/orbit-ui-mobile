import React from 'react'
import { describe, expect, it, vi } from 'vitest'

import { useDismissGuard } from '@/hooks/use-dismiss-guard'

const TestRenderer = require('react-test-renderer')

type DismissGuard = ReturnType<typeof useDismissGuard>

function renderDismissGuard(isDirty: boolean, onDismiss: () => void) {
  const holder: { current: DismissGuard | null } = { current: null }

  function Harness() {
    holder.current = useDismissGuard({ isDirty, onDismiss })
    return null
  }

  TestRenderer.act(() => {
    TestRenderer.create(React.createElement(Harness))
  })

  const current = () => {
    if (!holder.current) throw new Error('Expected useDismissGuard to initialize')
    return holder.current
  }

  return { current }
}

describe('mobile useDismissGuard', () => {
  it('dismisses immediately and stays dismissible when the form is clean', () => {
    const onDismiss = vi.fn()
    const guard = renderDismissGuard(false, onDismiss)

    expect(guard.current().canDismiss).toBe(true)

    TestRenderer.act(() => guard.current().requestDismiss())

    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(guard.current().showDiscardDialog).toBe(false)
  })

  it('opens the discard dialog instead of dismissing a dirty form', () => {
    const onDismiss = vi.fn()
    const guard = renderDismissGuard(true, onDismiss)

    expect(guard.current().canDismiss).toBe(false)

    TestRenderer.act(() => guard.current().requestDismiss())

    expect(onDismiss).not.toHaveBeenCalled()
    expect(guard.current().showDiscardDialog).toBe(true)
  })

  it('confirming the discard dialog dismisses and closes it', () => {
    const onDismiss = vi.fn()
    const guard = renderDismissGuard(true, onDismiss)

    TestRenderer.act(() => guard.current().requestDismiss())
    TestRenderer.act(() => guard.current().confirmDismiss())

    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(guard.current().showDiscardDialog).toBe(false)
  })

  it('cancelling the discard dialog closes it without dismissing', () => {
    const onDismiss = vi.fn()
    const guard = renderDismissGuard(true, onDismiss)

    TestRenderer.act(() => guard.current().requestDismiss())
    TestRenderer.act(() => guard.current().cancelDismiss())

    expect(onDismiss).not.toHaveBeenCalled()
    expect(guard.current().showDiscardDialog).toBe(false)
  })
})
