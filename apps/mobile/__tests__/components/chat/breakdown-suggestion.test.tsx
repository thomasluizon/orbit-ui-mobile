import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { expectPersonalTextLayout, expandedTextControls, pressTextControl } from '@/__tests__/support/personal-text'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BulkCreateResponse } from '@orbit/shared/types/habit'
import type { ConflictWarning } from '@orbit/shared/types/chat'
import {
  breakdownSubHabits as subHabits,
  makeBulkCreateResponse,
} from '@orbit/shared/test-support/chat-fixtures'
import { BreakdownSuggestion } from '@/components/chat/breakdown-suggestion'
import { renderedText } from '../../support/react-test-renderer'

const TestRenderer = require('react-test-renderer')
let isPending = false
const bulkCreate = vi.fn<(request: unknown) => Promise<BulkCreateResponse>>()

vi.mock('@/hooks/use-habits', () => ({
  useBulkCreateHabits: () => ({ mutateAsync: bulkCreate, isPending }),
}))

vi.mock('@/components/ui/confirm-sheet', () => ({
  ConfirmSheet: ({ open, onConfirm, onCancel, message }: { open: boolean; onConfirm: () => void; onCancel: () => void; message: string }) =>
    open ? React.createElement('ConfirmSheet', { onConfirm, onCancel, message }) : null,
}))

vi.mock('@/lib/theme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/theme')>()
  return {
    ...actual,
    createTokensV2: () => new Proxy({}, { get: () => '#111111' }),
  }
})

const defaultProps = {
  parentName: 'House routine',
  subHabits,
  onConfirmed: vi.fn(),
  onCancelled: vi.fn(),
}

function renderBreakdown(warning?: ConflictWarning) {
  let tree: any
  TestRenderer.act(() => {
    tree = TestRenderer.create(<BreakdownSuggestion {...defaultProps} warning={warning} />)
  })
  return tree
}

function press(tree: any, label: string) {
  return tree.root.findAll((node: any) =>
    typeof node.props?.onPress === 'function' && renderedText(node.props.children).includes(label),
  )[0]
}

beforeEach(() => {
  isPending = false
  bulkCreate.mockReset()
  defaultProps.onConfirmed.mockReset()
})

describe('BreakdownSuggestion (mobile)', () => {
  it('withholds the batch until the approval sheet is confirmed', async () => {
    bulkCreate.mockResolvedValue(makeBulkCreateResponse(['Success', 'Success']))
    const tree = renderBreakdown()

    expect(bulkCreate).not.toHaveBeenCalled()
    TestRenderer.act(() => {
      press(tree, 'chat.preview.approve').props.onPress()
    })
    expect(bulkCreate).not.toHaveBeenCalled()
    await TestRenderer.act(async () => {
      tree.root.findByType('ConfirmSheet').props.onConfirm()
      await Promise.resolve()
    })

    expect(bulkCreate).toHaveBeenCalledTimes(1)
    expect(defaultProps.onConfirmed).toHaveBeenCalledTimes(1)
  })

  it('collapses a rejected preview in place', () => {
    const tree = renderBreakdown()
    TestRenderer.act(() => press(tree, 'chat.preview.reject').props.onPress())

    expect(renderedText(tree.toJSON())).toContain('chat.preview.rejected')
    expect(renderedText(tree.toJSON())).not.toContain('chat.preview.approve')
  })

  it('edits one row and changes its cadence', () => {
    const tree = renderBreakdown()
    const edit = tree.root.findAll((node: any) =>
      node.props?.accessibilityLabel === 'chat.preview.editItem',
    )[0]
    TestRenderer.act(() => edit.props.onPress())
    const input = tree.root.findAll((node: any) =>
      typeof node.props?.onChangeText === 'function' &&
      String(node.props?.accessibilityLabel).includes('chat.preview.editName'),
    )[0]
    TestRenderer.act(() => input.props.onChangeText('Kitchen dishes'))
    expect(input.props.value).toBe('Kitchen dishes')

    const cadence = tree.root.findAll((node: any) =>
      String(node.props?.accessibilityLabel).includes('chat.breakdown.frequency') &&
      String(node.props?.accessibilityLabel).includes('Kitchen dishes'),
    )[0]
    expect(renderedText(cadence.props.children)).toContain('habits.filter.daily')
    TestRenderer.act(() => cadence.props.onPress())
    expect(renderedText(cadence.props.children)).toContain('habits.filter.weekly')
  })

  it('preserves yearly and one-time proposal cadences', () => {
    let tree: any
    TestRenderer.act(() => {
      tree = TestRenderer.create(<BreakdownSuggestion
        {...defaultProps}
        subHabits={[
          { title: 'Year review', frequencyUnit: 'Year' },
          { title: 'File taxes', frequencyUnit: null },
        ]}
      />)
    })
    const yearly = tree.root.findAll((node: any) =>
      typeof node.props?.onPress === 'function' &&
      String(node.props?.accessibilityLabel).includes('Year review') && String(node.props?.accessibilityLabel).includes('chat.breakdown.frequency'),
    )[0]
    const oneTime = tree.root.findAll((node: any) =>
      typeof node.props?.onPress === 'function' &&
      String(node.props?.accessibilityLabel).includes('File taxes') && String(node.props?.accessibilityLabel).includes('chat.breakdown.frequency'),
    )[0]

    expect(renderedText(yearly.props.children)).toContain('habits.filter.yearly')
    expect(renderedText(oneTime.props.children)).toContain('habits.filter.oneTime')
    TestRenderer.act(() => yearly.props.onPress())
    const updatedYearly = tree.root.findAll((node: any) =>
      typeof node.props?.onPress === 'function' &&
      String(node.props?.accessibilityLabel).includes('Year review') && String(node.props?.accessibilityLabel).includes('chat.breakdown.frequency'),
    )[0]
    expect(renderedText(updatedYearly.props.children)).toContain('habits.filter.oneTime')
  })

  it('names a colliding habit', () => {
    const warning: ConflictWarning = {
      hasConflict: true,
      conflictingHabits: [{ habitId: 'habit-1', habitTitle: 'Dishes', conflictDescription: 'Monday' }],
      severity: 'HIGH',
    }
    const tree = renderBreakdown(warning)

    expect(renderedText(tree.toJSON())).toContain('chat.breakdown.conflict')
    expect(renderedText(tree.toJSON())).toContain('Dishes')
  })

  it('retries only failed rows', async () => {
    bulkCreate
      .mockResolvedValueOnce(makeBulkCreateResponse(['Success', 'Failed']))
      .mockResolvedValueOnce(makeBulkCreateResponse(['Success']))
    const tree = renderBreakdown()

    TestRenderer.act(() => {
      press(tree, 'chat.preview.approve').props.onPress()
    })
    await TestRenderer.act(async () => {
      tree.root.findByType('ConfirmSheet').props.onConfirm()
      await Promise.resolve()
    })
    await TestRenderer.act(async () => {
      press(tree, 'chat.batch.retry').props.onPress()
      await Promise.resolve()
    })

    expect(bulkCreate).toHaveBeenCalledTimes(2)
    expect(bulkCreate.mock.calls[1]?.[0]).toMatchObject({ habits: [{ title: 'Laundry' }] })
  })
  it.each(['UnbrokenToken'.repeat(24), 'Read extraordinarilyLongWord daily before breakfast with the people in my neighborhood'])('discloses the full parent heading %s', async (name) => {
    const title = `chat.breakdown.title:${JSON.stringify({ name })}`
    let tree!: ReactTestRenderer
    await act(() => { tree = create(<BreakdownSuggestion {...defaultProps} parentName={name} />) })
    await expectPersonalTextLayout(tree.root, title)
    await act(() => pressTextControl(expandedTextControls(tree.root, `common.showFullText:${JSON.stringify({ name: title })}`, false)[0]!))
    expect(expandedTextControls(tree.root, `common.showFullText:${JSON.stringify({ name: title })}`, true)).toHaveLength(1)
    expect(bulkCreate).not.toHaveBeenCalled()
    await act(() => tree.update(<></>))
  })

})

function removalControl(tree: ReactTestRenderer, name: string) {
  const control = tree.root.findAll((node) => String(node.type) === 'Pressable' && String(node.props.accessibilityLabel).includes('habits.breakdown.removeHabit') && String(node.props.accessibilityLabel).includes(name))[0]
  expect(control).toBeDefined()
  return control!
}

function openConfirmation(tree: ReactTestRenderer) {
  const sheet = tree.root.findAll((node) => String(node.type) === 'ConfirmSheet')[0]!
  return sheet.props as { onConfirm: () => void; onCancel: () => void; message: string }
}

it('confirms removal and creates only the retained proposal on Android', async () => {
  bulkCreate.mockResolvedValue(makeBulkCreateResponse(['Success']))
  const tree = renderBreakdown() as ReactTestRenderer
  await act(() => pressTextControl(removalControl(tree, 'Dishes')))
  expect(openConfirmation(tree).message).toContain('Dishes')
  expect(renderedText(tree.root)).toContain('Dishes')
  expect(bulkCreate).not.toHaveBeenCalled()
  await act(() => openConfirmation(tree).onCancel())
  expect(removalControl(tree, 'Dishes')).toBeDefined()
  await act(() => pressTextControl(removalControl(tree, 'Dishes')))
  await act(() => openConfirmation(tree).onConfirm())
  expect(renderedText(tree.root)).not.toContain('Dishes')
  expect(renderedText(tree.root)).toContain('Laundry')
  expect(bulkCreate).not.toHaveBeenCalled()
  await act(() => press(tree, 'chat.preview.approve').props.onPress())
  await act(async () => { openConfirmation(tree).onConfirm(); await Promise.resolve() })
  expect(defaultProps.onConfirmed).toHaveBeenCalledTimes(1)
  expect(bulkCreate.mock.calls[0]?.[0]).toEqual({ habits: [expect.objectContaining({ title: 'Laundry', frequencyUnit: 'Week' })] })
  expect(tree.root.findAll((node) => String(node.props.accessibilityLabel).includes('habits.breakdown.removeHabit'))).toHaveLength(0)
  await act(() => tree.update(<></>))
})

it('disables approval and editing after removing every Android proposal', async () => {
  const tree = renderBreakdown() as ReactTestRenderer
  for (const name of ['Dishes', 'Laundry']) {
    await act(() => pressTextControl(removalControl(tree, name)))
    await act(() => openConfirmation(tree).onConfirm())
  }
  expect(renderedText(tree.root)).toContain('chat.breakdown.empty')
  expect(press(tree, 'chat.preview.approve').props.accessibilityState.disabled).toBe(true)
  expect(press(tree, 'chat.preview.edit').props.accessibilityState.disabled).toBe(true)
  expect(press(tree, 'chat.preview.reject').props.accessibilityState.disabled).toBe(false)
  expect(bulkCreate).not.toHaveBeenCalled()
  await act(() => tree.update(<></>))
})

it('disables removal while Android creation is pending', async () => {
  isPending = true
  const tree = renderBreakdown() as ReactTestRenderer
  const remove = removalControl(tree, 'Dishes')
  expect(remove.props.disabled).toBe(true)
  expect(remove.props.accessibilityState).toMatchObject({ disabled: true })
  expect(tree.root.findAll((node) => String(node.type) === 'ConfirmSheet')).toHaveLength(0)
  await act(() => tree.update(<></>))
})

it('keeps removed proposals out of Android failure recovery', async () => {
  bulkCreate.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(makeBulkCreateResponse(['Success']))
  const tree = renderBreakdown() as ReactTestRenderer
  await act(() => pressTextControl(removalControl(tree, 'Dishes')))
  await act(() => openConfirmation(tree).onConfirm())
  await act(() => press(tree, 'chat.preview.approve').props.onPress())
  await act(async () => { openConfirmation(tree).onConfirm(); await Promise.resolve() })
  expect(renderedText(tree.root)).toContain('blockFrame.status.failed')
  expect(defaultProps.onConfirmed).not.toHaveBeenCalled()
  expect(tree.root.findAll((node) => String(node.props.accessibilityLabel).includes('habits.breakdown.removeHabit'))).toHaveLength(0)
  await act(async () => { press(tree, 'chat.batch.retry').props.onPress(); await Promise.resolve() })
  expect(defaultProps.onConfirmed).toHaveBeenCalledTimes(1)
  expect(bulkCreate).toHaveBeenCalledTimes(2)
  for (const [request] of bulkCreate.mock.calls) expect(request).toEqual({ habits: [expect.objectContaining({ title: 'Laundry' })] })
  await act(() => tree.update(<></>))
})
