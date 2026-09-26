import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ScrollView, Text, TextInput } from 'react-native'
import type { PendingAgentOperation } from '@orbit/shared/types/ai'
import type { RevisePendingOperation } from '@orbit/shared/hooks'
import { makePendingAgentOperation } from '@orbit/shared/test-support/chat-fixtures'
import { PendingOperationCard } from '@/components/chat/pending-operation-card'
import { renderedText } from '../../support/react-test-renderer'
import { createTokensV2 } from '@/lib/theme'
import { sheetTestControls } from '../../support/sheet-double'

const TestRenderer = require('react-test-renderer')

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))

vi.mock('@/components/ui/confirm-sheet', () => ({
  ConfirmSheet: ({ open, onConfirm }: { open: boolean; onConfirm: () => void }) =>
    open ? React.createElement('ConfirmSheet', { onConfirm }) : null,
}))
vi.mock('@/components/ui/sheet', async () => await import('../../support/sheet-double'))
vi.mock('@/components/ui/otp-input', () => ({
  OtpInput: ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) =>
    <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} />,
}))

function renderCard(overrides: Partial<PendingAgentOperation> = {}, onRevise?: RevisePendingOperation) {
  const handlers = {
    onConfirmExecute: vi.fn(),
    onPrepareStepUp: vi.fn(),
    onVerifyStepUp: vi.fn(),
  }
  let tree: any
  TestRenderer.act(() => {
    tree = TestRenderer.create(<PendingOperationCard pendingOperation={makePendingAgentOperation(overrides)} onRevise={onRevise} {...handlers} />)
  })
  return { tree, handlers }
}

function press(tree: any, label: string) {
  return tree.root.findAll((node: any) =>
    typeof node.props?.onPress === 'function' && renderedText(node.props.children).includes(label),
  )[0]
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => sheetTestControls.defer(false))

describe('PendingOperationCard (mobile)', () => {
  const firstItem = {
    itemId: 'habit-1', entityId: 'habit-1', entityName: 'Run', stateFingerprint: 'state-1',
    fields: [{ entityId: 'habit-1', entityName: 'Run', field: 'date', oldValue: null, newValue: '2026-09-26', valueType: 'date' }],
  }
  const secondItem = {
    itemId: 'habit-2', entityId: 'habit-2', entityName: 'Read', stateFingerprint: 'state-2',
    fields: [{ entityId: 'habit-2', entityName: 'Read', field: 'date', oldValue: null, newValue: '2026-09-26', valueType: 'date' }],
  }
  const preview = { riskClass: 'Low' as const, confirmationRequirement: 'None' as const,
    previewFingerprint: 'preview-1', items: [firstItem, secondItem], changeTargetCount: 2 }

  it('removes one item before approving the rest', async () => {
    const revise = vi.fn().mockResolvedValue({ ok: true, result: {
      isSuccess: true, error: null, pendingOperationId: 'pending-1', cancelled: false,
      preview: { changes: [], changeTargetCount: 1, items: [secondItem], previewFingerprint: 'preview-2' },
    } })
    const { tree, handlers } = renderCard(preview, revise)
    handlers.onConfirmExecute.mockResolvedValue({ ok: true, response: { operation: { status: 'Succeeded' } } })
    await TestRenderer.act(async () => {
      tree.root.findByProps({ accessibilityLabel: 'chat.operation.remove Run' }).props.onPress()
      await Promise.resolve()
    })
    expect(revise).toHaveBeenCalledWith('pending-1', {
      previewFingerprint: 'preview-1', items: [{ itemId: 'habit-2' }],
    })
    expect(renderedText(tree.toJSON())).not.toContain('Run')
    await TestRenderer.act(async () => {
      press(tree, 'chat.operation.approve').props.onPress()
      await Promise.resolve()
    })
    expect(handlers.onConfirmExecute).toHaveBeenCalledOnce()
  })

  it('edits one field without executing', async () => {
    const revise = vi.fn().mockResolvedValue({ ok: true, result: {
      isSuccess: true, error: null, pendingOperationId: 'pending-1', cancelled: false,
      preview: { changes: [], changeTargetCount: 2, items: [firstItem, secondItem], previewFingerprint: 'preview-2' },
    } })
    const { tree, handlers } = renderCard(preview, revise)
    TestRenderer.act(() => press(tree, 'chat.operation.edit').props.onPress())
    TestRenderer.act(() => tree.root.findByProps({ accessibilityLabel: 'chat.operation.field.date' }).props.onChangeText('2026-09-27'))
    await TestRenderer.act(async () => {
      press(tree, 'common.save').props.onPress()
      await Promise.resolve()
    })
    expect(revise).toHaveBeenCalledWith('pending-1', {
      previewFingerprint: 'preview-1',
      items: [{ itemId: 'habit-1', edits: { date: '2026-09-27' } }, { itemId: 'habit-2' }],
    })
    expect(handlers.onConfirmExecute).not.toHaveBeenCalled()
    expect(renderedText(tree.toJSON())).toContain('chat.operation.edited')
  })

  it('rejects every item and collapses the preview', async () => {
    const revise = vi.fn().mockResolvedValue({ ok: true, result: {
      isSuccess: true, error: null, pendingOperationId: null, preview: null, cancelled: true,
    } })
    const { tree, handlers } = renderCard(preview, revise)
    await TestRenderer.act(async () => {
      press(tree, 'chat.operation.reject').props.onPress()
      await Promise.resolve()
    })
    expect(renderedText(tree.toJSON())).toContain('chat.operation.rejected')
    expect(renderedText(tree.toJSON())).not.toContain('chat.operation.approve')
    expect(handlers.onConfirmExecute).not.toHaveBeenCalled()
  })

  it('removing the last item removes approval', async () => {
    const revise = vi.fn().mockResolvedValueOnce({ ok: true, result: {
      isSuccess: true, error: null, pendingOperationId: 'pending-1', cancelled: false,
      preview: { changes: [], changeTargetCount: 1, items: [secondItem], previewFingerprint: 'preview-2' },
    } }).mockResolvedValueOnce({ ok: true, result: {
      isSuccess: true, error: null, pendingOperationId: null, preview: null, cancelled: true,
    } })
    const { tree, handlers } = renderCard(preview, revise)
    await TestRenderer.act(async () => {
      tree.root.findByProps({ accessibilityLabel: 'chat.operation.remove Run' }).props.onPress()
      await Promise.resolve()
    })
    await TestRenderer.act(async () => {
      tree.root.findByProps({ accessibilityLabel: 'chat.operation.remove Read' }).props.onPress()
      await Promise.resolve()
    })
    expect(revise).toHaveBeenLastCalledWith('pending-1', { previewFingerprint: 'preview-2', items: [] })
    expect(renderedText(tree.toJSON())).not.toContain('chat.operation.approve')
    expect(handlers.onConfirmExecute).not.toHaveBeenCalled()
  })

  it('keeps inferred emoji changes as a plain confirmation', () => {
    const revise = vi.fn()
    const { tree } = renderCard({ displayName: 'bulk_update_habit_emojis', items: null, previewFingerprint: null }, revise)
    expect(tree.root.findAllByProps({ accessibilityLabel: 'chat.operation.edit' })).toHaveLength(0)
    expect(renderedText(tree.toJSON())).not.toContain('chat.operation.reject')
    expect(renderedText(tree.toJSON())).toContain('chat.operation.approve')
  })

  it('replaces a same-ID preview and clears an unsaved draft when its fingerprint changes', () => {
    const { tree, handlers } = renderCard(preview, vi.fn())
    TestRenderer.act(() => press(tree, 'chat.operation.edit').props.onPress())
    TestRenderer.act(() => tree.root.findByProps({ accessibilityLabel: 'chat.operation.field.date' }).props.onChangeText('2026-09-30'))
    TestRenderer.act(() => tree.update(<PendingOperationCard pendingOperation={makePendingAgentOperation({ ...preview, items: [secondItem], changeTargetCount: 1, previewFingerprint: 'preview-other' })} onRevise={vi.fn()} {...handlers} />))
    expect(renderedText(tree.toJSON())).not.toContain('Run')
    expect(renderedText(tree.toJSON())).toContain('Read')
    expect(tree.root.findAllByProps({ accessibilityLabel: 'chat.operation.field.date' })).toHaveLength(0)
  })

  it('closes confirmation and blocks its old handler when the preview changes', async () => {
    const destructive = { ...preview, riskClass: 'Destructive' as const, confirmationRequirement: 'FreshConfirmation' as const }
    const { tree, handlers } = renderCard(destructive, vi.fn())
    TestRenderer.act(() => press(tree, 'chat.operation.approve').props.onPress())
    const oldConfirm = tree.root.findByType('ConfirmSheet').props.onConfirm

    TestRenderer.act(() => tree.update(<PendingOperationCard pendingOperation={makePendingAgentOperation({ ...destructive, previewFingerprint: 'preview-2', items: [secondItem] })} onRevise={vi.fn()} {...handlers} />))

    expect(tree.root.findAll((node: any) => node.type === 'ConfirmSheet')).toHaveLength(0)
    await TestRenderer.act(async () => { oldConfirm(); await Promise.resolve() })
    expect(handlers.onConfirmExecute).not.toHaveBeenCalled()
  })

  it('keeps confirmation open when the preview fingerprint is unchanged', () => {
    const destructive = { ...preview, riskClass: 'Destructive' as const, confirmationRequirement: 'FreshConfirmation' as const }
    const { tree, handlers } = renderCard(destructive, vi.fn())
    TestRenderer.act(() => press(tree, 'chat.operation.approve').props.onPress())
    TestRenderer.act(() => tree.update(<PendingOperationCard pendingOperation={makePendingAgentOperation({ ...destructive, items: [...destructive.items] })} onRevise={vi.fn()} {...handlers} />))
    expect(tree.root.findAll((node: any) => node.type === 'ConfirmSheet')).toHaveLength(1)
  })

  it('discards prepared step up when the preview changes', async () => {
    const highRisk = { ...preview, riskClass: 'High' as const, confirmationRequirement: 'StepUp' as const }
    const { tree, handlers } = renderCard(highRisk, vi.fn())
    handlers.onPrepareStepUp.mockResolvedValue({ ok: true, challengeId: 'challenge-1', confirmationToken: 'confirmation-1' })
    await TestRenderer.act(async () => { press(tree, 'chat.operation.stepUpAction').props.onPress(); await Promise.resolve() })
    expect(tree.root.findAllByType(TextInput).filter((node: any) => node.props.accessibilityLabel === 'stepUp.codeLabel')).toHaveLength(1)
    const oldVerify = tree.root.findAll((node: any) => node.props.prepared?.challengeId === 'challenge-1' && typeof node.props.onVerify === 'function')[0]?.props.onVerify

    TestRenderer.act(() => tree.update(<PendingOperationCard pendingOperation={makePendingAgentOperation({ ...highRisk, previewFingerprint: 'preview-2', items: [secondItem] })} onRevise={vi.fn()} {...handlers} />))

    expect(tree.root.findAllByType(TextInput).filter((node: any) => node.props.accessibilityLabel === 'stepUp.codeLabel')).toHaveLength(0)
    await oldVerify?.('pending-1', 'challenge-1', '123456', 'confirmation-1')
    expect(handlers.onVerifyStepUp).not.toHaveBeenCalled()
  })

  it('dismisses the native step-up sheet before removing it on preview replacement', async () => {
    sheetTestControls.defer(true)
    const highRisk = { ...preview, riskClass: 'High' as const, confirmationRequirement: 'StepUp' as const }
    const { tree, handlers } = renderCard(highRisk, vi.fn())
    handlers.onPrepareStepUp.mockResolvedValue({ ok: true, challengeId: 'challenge-1', confirmationToken: 'confirmation-1' })
    await TestRenderer.act(async () => { press(tree, 'chat.operation.stepUpAction').props.onPress(); await Promise.resolve() })

    TestRenderer.act(() => tree.update(<PendingOperationCard pendingOperation={makePendingAgentOperation({ ...highRisk, previewFingerprint: 'preview-2', items: [secondItem] })} onRevise={vi.fn()} {...handlers} />))

    expect(sheetTestControls.isDismissPending).toBe(true)
    expect(press(tree, 'common.cancel').props.disabled).toBe(true)
    expect(press(tree, 'stepUp.confirm').props.disabled).toBe(true)
    const dismiss = tree.root.find((node: any) => node.type === 'Pressable' && node.props.accessibilityLabel === 'attempt-dismiss')
    TestRenderer.act(() => dismiss.props.onPress())
    TestRenderer.act(() => sheetTestControls.completeDismissal())
    expect(tree.root.findAllByType(TextInput).filter((node: any) => node.props.accessibilityLabel === 'stepUp.codeLabel')).toHaveLength(0)
    expect(press(tree, 'chat.operation.stepUpAction').props.disabled).toBe(false)
    expect(handlers.onVerifyStepUp).not.toHaveBeenCalled()
  })

  it('removes the stale step-up sheet even when its native dismissal rejects', async () => {
    sheetTestControls.defer(true)
    const highRisk = { ...preview, riskClass: 'High' as const, confirmationRequirement: 'StepUp' as const }
    const { tree, handlers } = renderCard(highRisk, vi.fn())
    handlers.onPrepareStepUp.mockResolvedValue({ ok: true, challengeId: 'challenge-1', confirmationToken: 'confirmation-1' })
    await TestRenderer.act(async () => { press(tree, 'chat.operation.stepUpAction').props.onPress(); await Promise.resolve() })

    TestRenderer.act(() => tree.update(<PendingOperationCard pendingOperation={makePendingAgentOperation({ ...highRisk, previewFingerprint: 'preview-2', items: [secondItem] })} onRevise={vi.fn()} {...handlers} />))
    TestRenderer.act(() => sheetTestControls.rejectDismissal())

    expect(tree.root.findAllByType(TextInput).filter((node: any) => node.props.accessibilityLabel === 'stepUp.codeLabel')).toHaveLength(0)
    expect(press(tree, 'chat.operation.stepUpAction').props.disabled).toBe(false)
  })

  it('removes a stale editor even when its native dismissal rejects', async () => {
    const revise = vi.fn().mockResolvedValue({ ok: false, error: 'stale', stale: true })
    const { tree } = renderCard(preview, revise)
    TestRenderer.act(() => press(tree, 'chat.operation.edit').props.onPress())
    TestRenderer.act(() => tree.root.findByProps({ accessibilityLabel: 'chat.operation.field.date' }).props.onChangeText('2026-09-27'))
    sheetTestControls.defer(true)
    await TestRenderer.act(async () => {
      press(tree, 'common.save').props.onPress()
      await Promise.resolve()
    })
    TestRenderer.act(() => sheetTestControls.rejectDismissal())

    expect(tree.root.findAllByProps({ accessibilityLabel: 'chat.operation.field.date' })).toHaveLength(0)
  })

  it('keeps a pending verification response from replacing the stale native dismissal', async () => {
    sheetTestControls.defer(true)
    const highRisk = { ...preview, riskClass: 'High' as const, confirmationRequirement: 'StepUp' as const }
    const { tree, handlers } = renderCard(highRisk, vi.fn())
    handlers.onPrepareStepUp.mockResolvedValue({ ok: true, challengeId: 'challenge-1', confirmationToken: 'confirmation-1' })
    let resolveVerification!: (result: unknown) => void
    handlers.onVerifyStepUp.mockImplementation(() => new Promise((resolve) => { resolveVerification = resolve }))
    await TestRenderer.act(async () => { press(tree, 'chat.operation.stepUpAction').props.onPress(); await Promise.resolve() })
    TestRenderer.act(() => tree.root.findByProps({ accessibilityLabel: 'stepUp.codeLabel' }).props.onChangeText('123456'))
    TestRenderer.act(() => press(tree, 'stepUp.confirm').props.onPress())
    expect(handlers.onVerifyStepUp).toHaveBeenCalledOnce()

    TestRenderer.act(() => tree.update(<PendingOperationCard pendingOperation={makePendingAgentOperation({ ...highRisk, previewFingerprint: 'preview-2', items: [secondItem] })} onRevise={vi.fn()} {...handlers} />))
    await TestRenderer.act(async () => { resolveVerification({ ok: true, response: { operation: { status: 'Succeeded' } } }); await Promise.resolve() })
    expect(sheetTestControls.isDismissPending).toBe(true)
    TestRenderer.act(() => sheetTestControls.completeDismissal())
    expect(tree.root.findAllByType(TextInput).filter((node: any) => node.props.accessibilityLabel === 'stepUp.codeLabel')).toHaveLength(0)
    expect(press(tree, 'chat.operation.stepUpAction').props.disabled).toBe(false)
  })

  it('keeps a draft when the editor switches to another item and back', () => {
    const { tree } = renderCard(preview, vi.fn())
    TestRenderer.act(() => press(tree, 'chat.operation.edit').props.onPress())
    TestRenderer.act(() => tree.root.findByProps({ accessibilityLabel: 'chat.operation.field.date' }).props.onChangeText('2026-09-30'))
    TestRenderer.act(() => tree.root.findByProps({ accessibilityLabel: 'Read' }).props.onPress())
    TestRenderer.act(() => tree.root.findByProps({ accessibilityLabel: 'Run' }).props.onPress())
    expect(tree.root.findByProps({ accessibilityLabel: 'chat.operation.field.date' }).props.value).toBe('2026-09-30')
    expect(tree.root.findAllByProps({ accessibilityLabel: 'common.search' })).toHaveLength(0)
  })

  it('uses theme foreground for every editor label and weekday chip', () => {
    const fields = [
      { ...firstItem.fields[0]!, field: 'reminder_enabled', valueType: 'boolean', newValue: 'true' },
      { ...firstItem.fields[0]!, field: 'days', valueType: 'text', newValue: 'Monday' },
    ]
    const { tree } = renderCard({ ...preview, items: [{ ...firstItem, fields }] }, vi.fn())
    TestRenderer.act(() => press(tree, 'chat.operation.edit').props.onPress())
    const body = tree.root.findByProps({ testID: 'sheet-body-slot' })
    const foreground = createTokensV2('purple', 'dark').fg1
    for (const label of ['chat.operation.field.reminder_enabled', 'chat.operation.field.days', 'dates.daysLong.monday']) {
      const text = body.findAllByType(Text).find((node: any) => node.props.children === label)
      expect(text?.props.style).toMatchObject({ color: foreground })
    }
    expect(body.findAllByType(ScrollView)).toHaveLength(0)
  })

  it('shows editor search only when more than eight items are available', () => {
    const items = Array.from({ length: 9 }, (_, index) => ({ ...firstItem, itemId: `habit-${index}`, entityName: `Habit ${index}` }))
    const { tree } = renderCard({ ...preview, items, changeTargetCount: items.length }, vi.fn())
    TestRenderer.act(() => press(tree, 'chat.operation.edit').props.onPress())
    expect(tree.root.findAllByType(TextInput).filter((node: any) => node.props.accessibilityLabel === 'common.search')).toHaveLength(1)
  })
  it('states risk and requires confirmation before a destructive operation', async () => {
    const { tree, handlers } = renderCard()
    handlers.onConfirmExecute.mockResolvedValue({
      ok: true,
      response: { operation: { status: 'Succeeded' } },
    })

    expect(renderedText(tree.toJSON())).toContain('chat.operation.risk.destructive')
    expect(renderedText(tree.toJSON())).toContain('chat.operation.irreversible')
    TestRenderer.act(() => press(tree, 'chat.operation.approve').props.onPress())
    expect(handlers.onConfirmExecute).not.toHaveBeenCalled()
    await TestRenderer.act(async () => {
      tree.root.findByType('ConfirmSheet').props.onConfirm()
      await Promise.resolve()
    })
    expect(handlers.onConfirmExecute).toHaveBeenCalledWith('pending-1')
  })

  it('finishes a verified step up even when the native dismissal rejects', async () => {
    const { tree, handlers } = renderCard({ confirmationRequirement: 'StepUp', riskClass: 'High' })
    handlers.onPrepareStepUp.mockResolvedValue({ ok: true, challengeId: 'challenge-1', confirmationToken: 'confirmation-1' })
    handlers.onVerifyStepUp.mockResolvedValue({ ok: true, response: { operation: { status: 'Succeeded' } } })
    await TestRenderer.act(async () => { press(tree, 'chat.operation.stepUpAction').props.onPress(); await Promise.resolve() })
    TestRenderer.act(() => tree.root.findByProps({ accessibilityLabel: 'stepUp.codeLabel' }).props.onChangeText('123456'))
    sheetTestControls.defer(true)
    await TestRenderer.act(async () => { press(tree, 'stepUp.confirm').props.onPress(); await Promise.resolve() })
    TestRenderer.act(() => sheetTestControls.rejectDismissal())

    expect(renderedText(tree.toJSON())).toContain('status.done')
    expect(tree.root.findAllByType(TextInput).filter((node: any) => node.props.accessibilityLabel === 'stepUp.codeLabel')).toHaveLength(0)
  })

  it('hands step up to a sheet, verifies the code, and executes', async () => {
    const { tree, handlers } = renderCard({ confirmationRequirement: 'StepUp', riskClass: 'High' })
    handlers.onPrepareStepUp.mockResolvedValue({
      ok: true,
      challengeId: 'challenge-1',
      confirmationToken: 'confirmation-1',
    })
    handlers.onVerifyStepUp.mockResolvedValue({
      ok: true,
      response: { operation: { status: 'Succeeded' } },
    })

    expect(tree.root.findAll((node: any) => typeof node.props?.onChangeText === 'function')).toHaveLength(0)
    await TestRenderer.act(async () => {
      press(tree, 'chat.operation.stepUpAction').props.onPress()
      await Promise.resolve()
    })
    expect(handlers.onPrepareStepUp).toHaveBeenCalledWith('pending-1')
    const codeInput = tree.root.findByProps({ accessibilityLabel: 'stepUp.codeLabel' })
    TestRenderer.act(() => codeInput.props.onChangeText('123456'))
    await TestRenderer.act(async () => {
      press(tree, 'stepUp.confirm').props.onPress()
      await Promise.resolve()
    })
    expect(handlers.onVerifyStepUp).toHaveBeenCalledWith(
      'pending-1',
      'challenge-1',
      '123456',
      'confirmation-1',
    )
    expect(renderedText(tree.toJSON())).toContain('status.done')
  })

  it('cancels without executing', () => {
    const { tree, handlers } = renderCard()
    TestRenderer.act(() => press(tree, 'common.cancel').props.onPress())

    expect(tree.toJSON()).toBeNull()
    expect(handlers.onConfirmExecute).not.toHaveBeenCalled()
  })

  it('does not mark a denied execution as done', async () => {
    const { tree, handlers } = renderCard({ riskClass: 'Low', confirmationRequirement: 'None' })
    handlers.onConfirmExecute.mockResolvedValue({
      ok: true,
      response: { operation: { status: 'Denied' } },
    })
    await TestRenderer.act(async () => {
      press(tree, 'chat.operation.approve').props.onPress()
      await Promise.resolve()
    })

    expect(renderedText(tree.toJSON())).toContain('status.failed')
    expect(renderedText(tree.toJSON())).not.toContain('status.done')
  })
})
