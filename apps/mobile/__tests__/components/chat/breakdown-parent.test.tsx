import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BulkCreateRequest, BulkCreateResponse } from '@orbit/shared/types/habit'
import { breakdownSubHabits, makeBulkCreateResponse } from '@orbit/shared/test-support/chat-fixtures'
import { BreakdownSuggestion } from '@/components/chat/breakdown-suggestion'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { renderedText } from '../../support/react-test-renderer'

const bulkCreate = vi.fn<(request: BulkCreateRequest) => Promise<BulkCreateResponse>>()
vi.mock('@/hooks/use-habits', () => ({ useBulkCreateHabits: () => ({ mutateAsync: bulkCreate, isPending: false }) }))
vi.mock('@/components/ui/confirm-sheet', () => ({
  ConfirmSheet: ({ open, onConfirm, onCancel }: { open: boolean; onConfirm: () => void; onCancel: () => void }) => open ? React.createElement('ConfirmSheet', { onConfirm, onCancel }) : null,
}))
const onConfirmed = vi.fn()
const props = { parentName: 'House routine', subHabits: breakdownSubHabits, onConfirmed, onCancelled: vi.fn() }
async function renderBreakdown(subHabits = breakdownSubHabits) {
  let tree!: ReactTestRenderer
  await act(() => { tree = create(<BreakdownSuggestion {...props} subHabits={subHabits} />) })
  return tree
}
type ControlProps = { onPress: () => void; disabled: boolean; accessibilityState: { checked: boolean } }

function confirmation(tree: ReactTestRenderer) {
  return tree.root.findAll(node => node.type === ConfirmSheet)[0]!.props as { onConfirm: () => void; onCancel: () => void }
}
function grouping(tree: ReactTestRenderer) {
  return tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'checkbox' && node.props.accessibilityLabel === 'habits.breakdown.createAsParent')[0]!.props as ControlProps
}
function button(tree: ReactTestRenderer, label: string) {
  return tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'button' && renderedText(node.props.children).includes(label))[0]!.props as ControlProps
}
async function approve(tree: ReactTestRenderer) {
  await act(() => button(tree, 'chat.preview.approve').onPress())
  expect(bulkCreate).not.toHaveBeenCalled()
  await act(async () => { confirmation(tree).onConfirm(); await Promise.resolve() })
}
function expectCompleted(tree: ReactTestRenderer) {
  expect(tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'checkbox')).toHaveLength(0)
  for (const label of ['chat.preview.approve', 'chat.preview.edit', 'chat.preview.reject', 'chat.batch.retry']) expect(tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'button' && renderedText(node.props.children).includes(label))).toHaveLength(0)
  expect(tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityLiveRegion === 'polite' && renderedText(node.props.children) === 'chat.action.completed')).toHaveLength(1)
}
function expectParentRequest() {
  const request = bulkCreate.mock.calls[0]![0]
  expect(request.habits).toHaveLength(1)
  expect(request.habits[0]).toMatchObject({ title: 'House routine', frequencyUnit: 'Day', subHabits: [{ title: 'Dishes' }, { title: 'Laundry' }] })
}
function expectRowStatuses(tree: ReactTestRenderer, status: string, count: number) {
  expect(tree.root.findAll(node => typeof node.type === 'string' && String(node.props.testID).startsWith('block-frame-item-') && String(node.props.testID).endsWith(`-${status}`))).toHaveLength(count)
}
beforeEach(() => { bulkCreate.mockReset(); onConfirmed.mockReset() })

describe('breakdown parent choice on Android', () => {
  it.each([false, true])('creates independent habits after opting back out: %s', async (toggle) => {
    bulkCreate.mockResolvedValue(makeBulkCreateResponse(['Success', 'Success']))
    const tree = await renderBreakdown()
    expect(grouping(tree).accessibilityState.checked).toBe(false)
    if (toggle) { await act(() => grouping(tree).onPress()); await act(() => grouping(tree).onPress()) }
    await approve(tree)
    expect(onConfirmed).toHaveBeenCalledTimes(1)
    expect(bulkCreate.mock.calls[0]![0].habits.map(habit => habit.title)).toEqual(['Dishes', 'Laundry'])
    expect(bulkCreate.mock.calls[0]![0].habits.every(habit => habit.subHabits === undefined)).toBe(true)
    expectCompleted(tree)
  })

  it('creates a parent only after confirmation and marks every child done', async () => {
    bulkCreate.mockResolvedValue(makeBulkCreateResponse(['Success']))
    const tree = await renderBreakdown()
    await act(() => grouping(tree).onPress())
    expect(grouping(tree).accessibilityState.checked).toBe(true)
    await approve(tree)
    expect(onConfirmed).toHaveBeenCalledTimes(1)
    expectParentRequest()
    expectRowStatuses(tree, 'done', 2)
    expectCompleted(tree)
  })

  it('retains the parent choice when confirmation is cancelled', async () => {
    const tree = await renderBreakdown()
    await act(() => grouping(tree).onPress())
    await act(() => button(tree, 'chat.preview.approve').onPress())
    await act(() => confirmation(tree).onCancel())
    expect(grouping(tree).accessibilityState.checked).toBe(true)
    expect(bulkCreate).not.toHaveBeenCalled()
    expect(onConfirmed).not.toHaveBeenCalled()
  })

  it.each(['response', 'transport'])('retries the entire parent after a %s failure', async (failure) => {
    if (failure === 'transport') bulkCreate.mockRejectedValueOnce(new Error('Unavailable'))
    else bulkCreate.mockResolvedValueOnce(makeBulkCreateResponse(['Failed']))
    let finish!: (response: BulkCreateResponse) => void
    bulkCreate.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    const tree = await renderBreakdown()
    await act(() => grouping(tree).onPress())
    await approve(tree)
    expect(onConfirmed).not.toHaveBeenCalled()
    expectParentRequest()
    expectRowStatuses(tree, 'failed', 2)
    expect(grouping(tree).accessibilityState.checked).toBe(true)
    expect(grouping(tree).disabled).toBe(true)
    await act(async () => { button(tree, 'chat.batch.retry').onPress(); await Promise.resolve() })
    expect(button(tree, 'chat.batch.retry').disabled).toBe(true)
    await act(async () => { finish(makeBulkCreateResponse(['Success'])); await Promise.resolve() })
    expect(onConfirmed).toHaveBeenCalledTimes(1)
    expect(bulkCreate).toHaveBeenCalledTimes(2)
    expect(bulkCreate.mock.calls[1]![0]).toEqual(bulkCreate.mock.calls[0]![0])
    expectRowStatuses(tree, 'done', 2)
    expectCompleted(tree)
  })

  it.each([false, true])('keeps omitted blanks locked through failure and retry with grouping %s', async (createAsParent) => {
    bulkCreate.mockResolvedValueOnce(makeBulkCreateResponse(['Failed'])).mockResolvedValueOnce(makeBulkCreateResponse(['Success']))
    const tree = await renderBreakdown([{ title: ' ' }, { title: 'Dishes', frequencyUnit: 'Day' }])
    if (createAsParent) await act(() => grouping(tree).onPress())
    await approve(tree)
    expect(tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityLabel === 'chat.preview.editItem')).toHaveLength(0)
    expect(tree.root.findAll(node => typeof node.type === 'string' && String(node.props.accessibilityLabel).startsWith('chat.breakdown.frequency'))[0]!.props.disabled).toBe(true)
    await act(async () => { button(tree, 'chat.batch.retry').onPress(); await Promise.resolve() })
    expect(onConfirmed).toHaveBeenCalledTimes(1)
    expect(bulkCreate.mock.calls[1]![0]).toEqual(bulkCreate.mock.calls[0]![0])
    expectRowStatuses(tree, 'done', 1)
    expectCompleted(tree)
  })

  it('locks grouping, editing and approval while the parent request is pending', async () => {
    let finish!: (response: BulkCreateResponse) => void
    bulkCreate.mockReturnValue(new Promise(resolve => { finish = resolve }))
    const tree = await renderBreakdown()
    await act(() => grouping(tree).onPress())
    await approve(tree)
    expect(grouping(tree).disabled).toBe(true)
    for (const label of ['chat.preview.approve', 'chat.preview.edit', 'chat.preview.reject']) expect(button(tree, label).disabled).toBe(true)
    await act(() => grouping(tree).onPress())
    expect(grouping(tree).accessibilityState.checked).toBe(true)
    expect(bulkCreate).toHaveBeenCalledTimes(1)
    await act(async () => { finish(makeBulkCreateResponse(['Success'])); await Promise.resolve() })
    expect(onConfirmed).toHaveBeenCalledTimes(1)
  })

  it.each([false, true])('maps results to the nonempty submitted rows with grouping %s', async (createAsParent) => {
    bulkCreate.mockResolvedValue(makeBulkCreateResponse(['Success']))
    const tree = await renderBreakdown([{ title: ' ' }, { title: 'Dishes', frequencyUnit: 'Day' }])
    if (createAsParent) await act(() => grouping(tree).onPress())
    await approve(tree)
    expect(onConfirmed).toHaveBeenCalledTimes(1)
    expect(tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'block-frame-item-proposal-1-done')).toHaveLength(1)
    expectCompleted(tree)
    expect(tree.root.findAll(node => typeof node.type === 'string' && String(node.props.testID).startsWith('block-frame-item-') && String(node.props.testID).endsWith('-proposed'))).toHaveLength(0)
    expect(tree.root.findAll(node => typeof node.type === 'string' && renderedText(node.props.children) === 'chat.breakdown.confirmNote')).toHaveLength(0)
    expect(tree.root.findAll(node => typeof node.type === 'string' && String(node.props.accessibilityLabel).startsWith('chat.breakdown.frequency'))).toHaveLength(0)
  })
})
