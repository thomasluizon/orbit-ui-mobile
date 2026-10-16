import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
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
  ConfirmSheet: ({ open, onConfirm }: { open: boolean; onConfirm: () => void }) =>
    open ? React.createElement('ConfirmSheet', { onConfirm }) : null,
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


type NameInput = ReactTestInstance & {
  props: { autoFocus: boolean; value: string; onChangeText: (title: string) => void; onBlur: () => void; onFocus: () => void }
}

function nameInputs(tree: ReactTestRenderer): NameInput[] {
  return tree.root.findAll(node => typeof node.type === 'string' && typeof node.props.onChangeText === 'function') as NameInput[]
}

async function approveBreakdown(tree: ReactTestRenderer) {
  await act(() => press(tree, 'chat.preview.approve').props.onPress())
  expect(bulkCreate).not.toHaveBeenCalled()
  await act(() => {
    const confirm = tree.root.findAll(node => String(node.type) === 'ConfirmSheet')[0]!.props.onConfirm as () => void
    confirm()
  })
}

it('adds an editable one-time row and approves its edited cadence in the same batch', async () => {
  bulkCreate.mockResolvedValue(makeBulkCreateResponse(['Success', 'Success', 'Success']))
  const tree: ReactTestRenderer = renderBreakdown()
  await act(() => press(tree, 'habits.breakdown.addHabit').props.onPress())
  const input = nameInputs(tree)[0]!
  expect(input.props.autoFocus).toBe(true)
  expect(input.props.value).toBe('')
  const cadence = tree.root.findAll(node => typeof node.type === 'string' && String(node.props.accessibilityLabel).startsWith('chat.breakdown.frequency')).at(-1)!
  expect(renderedText(cadence.props.children)).toContain('habits.filter.oneTime')
  await act(() => input.props.onChangeText('  Sweep  '))
  await act(() => (cadence.props.onPress as () => void)())
  await act(() => (cadence.props.onPress as () => void)())
  await act(() => input.props.onBlur())
  const addedRow = tree.root.findAll(node => typeof node.type === 'string' && String(node.props.testID).startsWith('block-frame-item-breakdown-'))[0]!
  expect(addedRow.props.testID).not.toMatch(/-proposed$/)
  expect(tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'block-frame-item-proposal-0-pending-proposed')).toHaveLength(1)
  expect(bulkCreate).not.toHaveBeenCalled()
  await approveBreakdown(tree)
  expect(bulkCreate).toHaveBeenCalledTimes(1)
  expect(bulkCreate.mock.calls[0]?.[0]).toMatchObject({ habits: [
    { title: 'Dishes', frequencyUnit: 'Day' },
    { title: 'Laundry', frequencyUnit: 'Week' },
    { title: 'Sweep', frequencyUnit: 'Week', frequencyQuantity: 1 },
  ] })
  expect(defaultProps.onConfirmed).toHaveBeenCalledTimes(1)
  expect(press(tree, 'habits.breakdown.addHabit')).toBeUndefined()
})

it('keeps multiple added drafts distinct and retries the failed named row after a blank', async () => {
  bulkCreate.mockResolvedValueOnce(makeBulkCreateResponse(['Success', 'Success', 'Failed']))
    .mockResolvedValueOnce(makeBulkCreateResponse(['Success']))
  const tree: ReactTestRenderer = renderBreakdown()
  await act(() => press(tree, 'habits.breakdown.addHabit').props.onPress())
  await act(() => nameInputs(tree)[0]!.props.onChangeText('   '))
  await act(() => nameInputs(tree)[0]!.props.onBlur())
  await act(() => press(tree, 'habits.breakdown.addHabit').props.onPress())
  expect(nameInputs(tree)).toHaveLength(2)
  await act(() => nameInputs(tree)[1]!.props.onChangeText('Sweep'))
  await act(() => nameInputs(tree)[1]!.props.onBlur())
  await approveBreakdown(tree)
  const failed = tree.root.findAll(node => typeof node.type === 'string' && String(node.props.testID).endsWith('-failed'))
  expect(failed).toHaveLength(1)
  expect(renderedText(failed[0]!.props.children)).toContain('Sweep')
  expect(defaultProps.onConfirmed).not.toHaveBeenCalled()
  expect(press(tree, 'habits.breakdown.addHabit')).toBeUndefined()
  await act(() => { press(tree, 'chat.batch.retry').props.onPress() })
  expect(bulkCreate.mock.calls[1]?.[0]).toMatchObject({ habits: [{ title: 'Sweep' }] })
  expect(defaultProps.onConfirmed).toHaveBeenCalledTimes(1)
})

it('keeps added rows after a limit rejection and retries without blank drafts', async () => {
  bulkCreate.mockRejectedValueOnce(new Error('habit limit'))
    .mockResolvedValueOnce(makeBulkCreateResponse(['Success', 'Success', 'Success']))
  const tree: ReactTestRenderer = renderBreakdown()
  await act(() => press(tree, 'habits.breakdown.addHabit').props.onPress())
  await act(() => nameInputs(tree)[0]!.props.onChangeText('Sweep'))
  await act(() => nameInputs(tree)[0]!.props.onBlur())
  await act(() => press(tree, 'habits.breakdown.addHabit').props.onPress())
  await approveBreakdown(tree)
  expect(tree.root.findAll(node => typeof node.type === 'string' && String(node.props.testID).endsWith('-failed'))).toHaveLength(3)
  expect(defaultProps.onConfirmed).not.toHaveBeenCalled()
  await act(() => { press(tree, 'chat.batch.retry').props.onPress() })
  expect(bulkCreate.mock.calls[1]?.[0]).toMatchObject({ habits: [{ title: 'Dishes' }, { title: 'Laundry' }, { title: 'Sweep' }] })
  expect(defaultProps.onConfirmed).toHaveBeenCalledTimes(1)
})

it('disables adding while the batch is pending', () => {
  isPending = true
  const tree: ReactTestRenderer = renderBreakdown()
  expect(press(tree, 'habits.breakdown.addHabit').props.disabled).toBe(true)
  expect(press(tree, 'habits.breakdown.addHabit').props.accessibilityState.disabled).toBe(true)
  expect(nameInputs(tree)).toHaveLength(0)
  expect(bulkCreate).not.toHaveBeenCalled()
})

it('does not send blank-only drafts and can add to an empty proposal', async () => {
  let tree!: ReactTestRenderer
  await act(() => { tree = create(<BreakdownSuggestion {...defaultProps} subHabits={[]} />) })
  await act(() => press(tree, 'habits.breakdown.addHabit').props.onPress())
  await act(() => nameInputs(tree)[0]!.props.onChangeText('   '))
  await approveBreakdown(tree)
  expect(bulkCreate).not.toHaveBeenCalled()
  expect(defaultProps.onConfirmed).not.toHaveBeenCalled()
})


it('keeps a blank added row editable when it is focused again', async () => {
  const tree: ReactTestRenderer = renderBreakdown()
  await act(() => press(tree, 'habits.breakdown.addHabit').props.onPress())
  const input = nameInputs(tree)[0]!
  await act(() => input.props.onBlur())
  await act(() => input.props.onFocus())
  await act(() => input.props.onChangeText('Sweep'))
  expect(nameInputs(tree)[0]!.props.value).toBe('Sweep')
})
