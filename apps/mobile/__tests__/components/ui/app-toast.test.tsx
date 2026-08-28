import React from 'react'
import { Text } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Toast } from '@/components/ui/app-toast'
import { createTokensV2 } from '@/lib/theme'

const TestRenderer = require('react-test-renderer')

function render(element: React.ReactNode) {
  let tree: any
  TestRenderer.act(() => {
    tree = TestRenderer.create(element)
  })
  return tree
}

function advance(milliseconds: number) {
  TestRenderer.act(() => vi.advanceTimersByTime(milliseconds))
}

describe('mobile Toast', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('calls onDone once at the default 5000ms and never before', () => {
    const onDone = vi.fn()
    render(<Toast kind="done" message="Saved" onDone={onDone} />)

    advance(4999)
    expect(onDone).not.toHaveBeenCalled()
    advance(1)
    expect(onDone).toHaveBeenCalledTimes(1)
    advance(25000)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('clamps a short done life to 5000ms', () => {
    const onDone = vi.fn()
    render(<Toast kind="done" message="Saved" doneAfterMs={2000} onDone={onDone} />)

    advance(2000)
    expect(onDone).not.toHaveBeenCalled()
    advance(3000)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('honors an 8000ms life exactly once', () => {
    const onDone = vi.fn()
    render(<Toast kind="done" message="Saved" doneAfterMs={8000} onDone={onDone} />)

    advance(7999)
    expect(onDone).not.toHaveBeenCalled()
    advance(1)
    expect(onDone).toHaveBeenCalledTimes(1)
    advance(22000)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('pauses on hover and resumes when the pointer leaves', () => {
    const onDone = vi.fn()
    const tree = render(<Toast kind="done" message="Saved" onDone={onDone} />)
    const toast = tree.root.findByProps({ testID: 'toast-done' })

    advance(1000)
    TestRenderer.act(() => toast.props.onHoverIn())
    advance(30000)
    expect(onDone).not.toHaveBeenCalled()
    TestRenderer.act(() => toast.props.onHoverOut())
    advance(4000)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('pauses on focus and resumes on blur', () => {
    const onDone = vi.fn()
    const tree = render(<Toast kind="done" message="Saved" onDone={onDone} />)
    const toast = tree.root.findByProps({ testID: 'toast-done' })

    TestRenderer.act(() => toast.props.onFocus())
    advance(30000)
    expect(onDone).not.toHaveBeenCalled()
    TestRenderer.act(() => toast.props.onBlur())
    advance(5000)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('keeps lost feedback mounted and calls its action once per press', () => {
    const onAction = vi.fn()
    const tree = render(
      <Toast
        kind="lost"
        message="The change was lost."
        detail="Do it again."
        actionLabel="Retry"
        onAction={onAction}
      />,
    )
    advance(0)
    advance(30000)

    expect(tree.root.findByProps({ testID: 'toast-lost' })).toBeTruthy()
    const action = tree.root.findByProps({ testID: 'toast-action' })
    TestRenderer.act(() => action.props.onPress())
    TestRenderer.act(() => action.props.onPress())
    expect(onAction).toHaveBeenCalledTimes(2)
  })

  it('calls a neutral action and does nothing when its host removes it', () => {
    const onAction = vi.fn()
    const tree = render(
      <Toast kind="neutral" message="Queued" actionLabel="Undo" onAction={onAction} />,
    )
    const action = tree.root.findByProps({ testID: 'toast-action' })
    TestRenderer.act(() => action.props.onPress())
    expect(onAction).toHaveBeenCalledTimes(1)

    const untouched = vi.fn()
    const removed = render(
      <Toast kind="neutral" message="Queued" actionLabel="Undo" onAction={untouched} />,
    )
    TestRenderer.act(() => removed.unmount())
    expect(untouched).not.toHaveBeenCalled()
  })

  it('draws the working mark itself and no icon element', () => {
    const tree = render(<Toast kind="working" message="Saving" />)

    expect(tree.root.findByProps({ testID: 'toast-working-mark' })).toBeTruthy()
    expect(tree.root.findAllByProps({ testID: 'caller-icon' })).toHaveLength(0)
  })

  it('announces neutral, working, and done politely, and lost assertively', () => {
    const neutral = render(<Toast kind="neutral" message="Fact" />)
    expect(neutral.root.findByProps({ testID: 'toast-neutral' }).props.accessibilityLiveRegion).toBe('polite')
    const working = render(<Toast kind="working" message="Working" />)
    expect(working.root.findByProps({ testID: 'toast-working' }).props.accessibilityLiveRegion).toBe('polite')
    const done = render(<Toast kind="done" message="Done" onDone={() => {}} />)
    expect(done.root.findByProps({ testID: 'toast-done' }).props.accessibilityLiveRegion).toBe('polite')
    const lost = render(
      <Toast kind="lost" message="Lost" detail="Retry" actionLabel="Retry" onAction={() => {}} />,
    )
    expect(lost.root.findByProps({ testID: 'toast-lost' }).props.accessibilityLiveRegion).toBe('assertive')
  })

  it('never asks for focus when any kind mounts', () => {
    const neutral = render(<Toast kind="neutral" message="Fact" />)
    const working = render(<Toast kind="working" message="Working" />)
    const done = render(<Toast kind="done" message="Done" onDone={() => {}} />)
    const lost = render(
      <Toast kind="lost" message="Lost" detail="Retry" actionLabel="Retry" onAction={() => {}} />,
    )

    for (const [tree, id] of [
      [neutral, 'toast-neutral'],
      [working, 'toast-working'],
      [done, 'toast-done'],
      [lost, 'toast-lost'],
    ] as const) {
      expect(tree.root.findByProps({ testID: id }).props.focusable).toBe(false)
    }
  })

  it('mounts the live region empty before writing its message', () => {
    const tree = render(<Toast kind="neutral" message="Fact" />)
    const toast = tree.root.findByProps({ testID: 'toast-neutral' })

    expect(toast.props.accessibilityLabel).toBe('')
    advance(0)
    expect(tree.root.findByProps({ testID: 'toast-neutral' }).props.accessibilityLabel).toBe('Fact')
  })

  it('draws completion with statusDone and not the accent', () => {
    const tree = render(<Toast kind="done" message="Saved" onDone={() => {}} />)
    const mark = tree.root.findByProps({ testID: 'toast-done-mark' })
    const tokens = createTokensV2('purple', 'dark')
    const style = mark.props.style.flat()

    expect(style).toContainEqual(expect.objectContaining({ backgroundColor: tokens.statusDone }))
    expect(style).not.toContainEqual(expect.objectContaining({ backgroundColor: tokens.primary }))
  })

  it('accepts a neutral icon but working has no icon slot', () => {
    const neutral = render(
      <Toast kind="neutral" message="Fact" icon={<Text testID="caller-icon">icon</Text>} />,
    )
    expect(neutral.root.findByProps({ testID: 'caller-icon' })).toBeTruthy()
    const working = render(<Toast kind="working" message="Working" />)
    expect(working.root.findAllByProps({ testID: 'caller-icon' })).toHaveLength(0)
  })
})
