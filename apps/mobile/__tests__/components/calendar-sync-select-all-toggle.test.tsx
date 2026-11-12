import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTokensV2 } from '@/lib/theme'
import { SelectAllToggle } from '@/components/calendar-sync/calendar-sync-select-all-toggle'
import { expectMotionPress, pressableStyle } from '@/__tests__/support/press-feedback'

const TestRenderer = require('react-test-renderer')
const motionState = vi.hoisted(() => ({ reduced: false }))
vi.mock('@/lib/motion', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/motion')>()), usePrefersReducedMotion: () => motionState.reduced }))

const tokens = createTokensV2('purple', 'dark')
const selectAllLabel = 'Select all'
const deselectAllLabel = 'Deselect all'

interface TestNode {
  type: unknown
  props: Record<string, unknown>
}

function renderToggle(allSelected: boolean, onToggle: () => void) {
  let tree: { root: { findAll: (predicate: (node: TestNode) => boolean) => TestNode[] } }
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      <SelectAllToggle
        allSelected={allSelected}
        onToggle={onToggle}
        selectAllLabel={selectAllLabel}
        deselectAllLabel={deselectAllLabel}
        tokens={tokens}
        tintStyle={undefined}
      />,
    )
  })
  return tree!
}

function getButton(tree: ReturnType<typeof renderToggle>) {
  const nodes = tree.root.findAll(
    (node) => typeof node.type === 'string' && node.props.accessibilityRole === 'button',
  )
  return nodes[0]!
}

describe('mobile SelectAllToggle', () => {
  beforeEach(() => { motionState.reduced = false })

  it('paints the whole enabled target without invisible slop', () => {
    const button = getButton(renderToggle(false, vi.fn()))
    expect(button.props.disabled).toBeUndefined()
    expect(button.props.accessibilityState).toEqual({ selected: false })
    expect(button.props.hitSlop).toBeUndefined()
    expect(pressableStyle(button, false).opacity).toBeUndefined()
    expect(pressableStyle(button, false)).toMatchObject({ backgroundColor: 'transparent' })
    expect(pressableStyle(button, true)).toMatchObject({ width: 48, height: 48, backgroundColor: tokens.bgHover })
  })

  it.each([false, true])('presses through MotionPressable on the shared press timing, as the web icon button does (reduced motion %s)', (reducedMotion) => {
    motionState.reduced = reducedMotion
    expectMotionPress(getButton(renderToggle(false, vi.fn())), reducedMotion)
  })

  it('exposes the select-all label when nothing is selected', () => {
    const tree = renderToggle(false, vi.fn())
    expect(getButton(tree).props.accessibilityLabel).toBe(selectAllLabel)
  })

  it('exposes the deselect-all label when everything is selected', () => {
    const tree = renderToggle(true, vi.fn())
    expect(getButton(tree).props.accessibilityLabel).toBe(deselectAllLabel)
  })

  it('calls onToggle when pressed', () => {
    const onToggle = vi.fn()
    const tree = renderToggle(false, onToggle)
    TestRenderer.act(() => {
      ;(getButton(tree).props.onPress as () => void)()
    })
    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})
