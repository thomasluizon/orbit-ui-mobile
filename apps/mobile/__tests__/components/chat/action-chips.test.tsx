import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { ActionResult } from '@orbit/shared/types/chat'
import { ActionChips } from '@/components/chat/action-chips'

const TestRenderer = require('react-test-renderer')

vi.mock('@/components/ui/block-frame', () => ({
  BlockFrame: (props: Record<string, any>) => React.createElement(
    'BlockFrame',
    props,
    ...props.items.map((item: Record<string, any>) => React.createElement('Item', item, item.label, item.meta, item.control)),
    props.actions,
  ),
}))

vi.mock('@/components/ui/pill-button', () => ({
  Button: ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) =>
    React.createElement('Button', { onPress: onClick }, children),
}))

vi.mock('@/components/chat/conflict-warning', () => ({
  ConflictWarning: () => React.createElement('ConflictWarning'),
}))

function action(overrides: Partial<ActionResult> = {}): ActionResult {
  return {
    type: 'LogHabit',
    status: 'Success',
    entityId: 'habit-1',
    entityName: 'Meditate',
    ...overrides,
  }
}

function renderActions(actions: ActionResult[], onChipClick?: (id: string, type: string) => void) {
  let tree: any
  TestRenderer.act(() => {
    tree = TestRenderer.create(<ActionChips actions={actions} onChipClick={onChipClick} />)
  })
  return tree
}

describe('ActionChips (mobile)', () => {
  it('renders legacy results as one block and omits suggestions', () => {
    const tree = renderActions([action(), action({ status: 'Suggestion' })])
    const frame = tree.root.findByType('BlockFrame')

    expect(frame.props.title).toBe('chat.action.changes')
    expect(frame.props.items).toHaveLength(1)
    expect(frame.props.items[0].status).toBe('done')
  })

  it('uses the frame failed state without exposing a server error', () => {
    const tree = renderActions([action({ status: 'Failed', error: 'database unavailable' })])
    const frame = tree.root.findByType('BlockFrame')

    expect(frame.props.state).toBe('partiallyFailed')
    expect(frame.props.items[0].meta).toBe('chat.operation.status.Failed')
    expect(JSON.stringify(tree.toJSON())).not.toContain('database unavailable')
  })

  it('opens a successful navigable result', () => {
    const onChipClick = vi.fn()
    const tree = renderActions([action()], onChipClick)

    TestRenderer.act(() => tree.root.findByType('Button').props.onPress())
    expect(onChipClick).toHaveBeenCalledWith('habit-1', 'LogHabit')
  })

  it('does not add a control for a destructive result', () => {
    const tree = renderActions([action({ type: 'DeleteHabit' })], vi.fn())

    expect(tree.root.findAllByType('Button')).toHaveLength(0)
  })

  it('localizes unknown operation symbols instead of rendering them', () => {
    const tree = renderActions([action({ type: 'UnexpectedServerSymbol' })])
    const frame = tree.root.findByType('BlockFrame')

    expect(frame.props.items[0].label).toBe('chat.action.completed')
    expect(JSON.stringify(tree.toJSON())).not.toContain('UnexpectedServerSymbol')
  })
})
