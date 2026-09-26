import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { makePendingAgentOperation } from '@orbit/shared/test-support/chat-fixtures'
import { PendingOperationCard } from '@/components/chat/pending-operation-card'
import { sheetTestControls } from '../../support/sheet-double'

const capturedSheet = vi.hoisted(() => ({ onConfirm: undefined as (() => void) | undefined }))
const capturedVerification = vi.hoisted(() => ({ onVerify: undefined as ((id: string, challengeId: string, code: string, token: string) => Promise<unknown>) | undefined }))
const capturedCard = vi.hoisted(() => ({ isCurrent: undefined as (() => boolean) | undefined }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/hooks/use-pending-operation-card-state', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/hooks/use-pending-operation-card-state')>()
  return {
    ...original,
    usePendingOperationCardState: (props: Parameters<typeof original.usePendingOperationCardState>[0]) => {
      const card = original.usePendingOperationCardState(props)
      capturedCard.isCurrent = card.isCurrent
      return card
    },
    usePendingOperationStepUpVerification: (props: Parameters<typeof original.usePendingOperationStepUpVerification>[0]) => {
      capturedVerification.onVerify = props.onVerify
      return original.usePendingOperationStepUpVerification(props)
    },
  }
})
vi.mock('@/components/ui/confirm-sheet', () => ({
  ConfirmSheet: ({ open, onConfirm }: { open: boolean; onConfirm: () => void }) =>
    open ? (capturedSheet.onConfirm = onConfirm, <button type="button" onClick={onConfirm}>confirm-sheet</button>) : null,
}))
vi.mock('@/components/ui/sheet', async () => await import('../../support/sheet-double'))
vi.mock('@/components/ui/otp-input', () => ({
  OtpInput: ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) =>
    <input aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} />,
}))

const confirm = vi.fn()
const prepareStepUp = vi.fn()
const verifyStepUp = vi.fn()
const revise = vi.fn()
const firstItem = {
  itemId: 'habit-1', entityId: 'habit-1', entityName: 'Run', stateFingerprint: 'state-1',
  fields: [{ entityId: 'habit-1', entityName: 'Run', field: 'date', oldValue: null, newValue: '2026-09-26', valueType: 'date' }],
}
const secondItem = {
  itemId: 'habit-2', entityId: 'habit-2', entityName: 'Read', stateFingerprint: 'state-2',
  fields: [{ entityId: 'habit-2', entityName: 'Read', field: 'date', oldValue: null, newValue: '2026-09-26', valueType: 'date' }],
}
const preview = makePendingAgentOperation({
  riskClass: 'Low', confirmationRequirement: 'None', previewFingerprint: 'preview-1',
  items: [firstItem, secondItem], changeTargetCount: 2,
})

describe('PendingOperationCard', () => {
  afterEach(() => sheetTestControls.defer(false))
  beforeEach(() => {
    capturedSheet.onConfirm = undefined
    capturedVerification.onVerify = undefined
    capturedCard.isCurrent = undefined
    confirm.mockReset()
    prepareStepUp.mockReset()
    verifyStepUp.mockReset()
    revise.mockReset()
  })

  it('states risk and requires a sheet before a destructive operation', async () => {
    confirm.mockResolvedValue({ ok: true, response: { operation: { status: 'Succeeded' } } })
    render(<PendingOperationCard pendingOperation={makePendingAgentOperation()} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)

    expect(screen.getByText('chat.operation.risk.destructive')).toBeInTheDocument()
    expect(screen.getByText('chat.operation.irreversible')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.approve' }))
    expect(confirm).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'confirm-sheet' }))

    await waitFor(() => expect(confirm).toHaveBeenCalledWith('pending-1'))
  })

  it('hands step up to a sheet, verifies the code, and executes', async () => {
    prepareStepUp.mockResolvedValue({
      ok: true,
      challengeId: 'challenge-1',
      confirmationToken: 'confirmation-1',
    })
    verifyStepUp.mockResolvedValue({
      ok: true,
      response: { operation: { status: 'Succeeded' } },
    })
    render(<PendingOperationCard pendingOperation={makePendingAgentOperation({ confirmationRequirement: 'StepUp', riskClass: 'High' })} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.stepUpAction' }))
    await waitFor(() => expect(prepareStepUp).toHaveBeenCalledWith('pending-1'))
    fireEvent.change(screen.getByRole('textbox', { name: 'stepUp.codeLabel' }), {
      target: { value: '123456' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'stepUp.confirm' }))

    await waitFor(() => expect(verifyStepUp).toHaveBeenCalledWith(
      'pending-1',
      'challenge-1',
      '123456',
      'confirmation-1',
    ))
    expect(await screen.findByText('status.done')).toBeInTheDocument()
  })

  it('cancels without executing', () => {
    render(<PendingOperationCard pendingOperation={makePendingAgentOperation()} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }))
    expect(screen.queryByText('chat.operation.pendingTitle')).not.toBeInTheDocument()
    expect(confirm).not.toHaveBeenCalled()
  })

  it('does not mark a denied execution as done', async () => {
    confirm.mockResolvedValue({ ok: true, response: { operation: { status: 'Denied' } } })
    render(<PendingOperationCard pendingOperation={makePendingAgentOperation({ riskClass: 'Low', confirmationRequirement: 'None' })} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.approve' }))
    await waitFor(() => expect(screen.getByText('status.failed')).toBeInTheDocument())
  })

  it('removes one item before approval executes the remaining preview', async () => {
    revise.mockResolvedValue({ ok: true, result: {
      isSuccess: true, error: null, pendingOperationId: 'pending-1', cancelled: false,
      preview: { changes: [], changeTargetCount: 1, items: [secondItem], previewFingerprint: 'preview-2' },
    } })
    confirm.mockResolvedValue({ ok: true, response: { operation: { status: 'Succeeded' } } })
    render(<PendingOperationCard pendingOperation={preview} onRevise={revise} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    expect(confirm).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.remove Run' }))
    await waitFor(() => expect(revise).toHaveBeenCalledWith('pending-1', {
      previewFingerprint: 'preview-1', items: [{ itemId: 'habit-2' }],
    }))
    expect(screen.queryByText('Run')).not.toBeInTheDocument()
    expect(capturedCard.isCurrent?.()).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.approve' }))
    await waitFor(() => expect(confirm).toHaveBeenCalledOnce())
  })

  it('edits one item and sends only the changed field before approval', async () => {
    const editedItem = { ...firstItem, fields: [{ ...firstItem.fields[0], newValue: '2026-09-27' }] }
    revise.mockResolvedValue({ ok: true, result: {
      isSuccess: true, error: null, pendingOperationId: 'pending-1', cancelled: false,
      preview: { changes: [], changeTargetCount: 2, items: [editedItem, secondItem], previewFingerprint: 'preview-2' },
    } })
    render(<PendingOperationCard pendingOperation={preview} onRevise={revise} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'chat.operation.edit' })[0]!)
    fireEvent.change(screen.getByRole('textbox', { name: 'chat.operation.field.date' }), { target: { value: '2026-09-27' } })
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))
    await waitFor(() => expect(revise).toHaveBeenCalledWith('pending-1', {
      previewFingerprint: 'preview-1',
      items: [{ itemId: 'habit-1', edits: { date: '2026-09-27' } }, { itemId: 'habit-2' }],
    }))
    expect(confirm).not.toHaveBeenCalled()
    expect(screen.getByText(/chat.operation.edited/)).toBeInTheDocument()
    expect(screen.getAllByRole('group', { name: 'chat.preview.proposed' })).toHaveLength(1)
  })

  it('collapses the rejected preview with no approval action', async () => {
    revise.mockResolvedValue({ ok: true, result: {
      isSuccess: true, error: null, pendingOperationId: null, preview: null, cancelled: true,
    } })
    render(<PendingOperationCard pendingOperation={preview} onRevise={revise} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.reject' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('chat.operation.rejected'))
    expect(screen.queryByRole('button', { name: 'chat.operation.approve' })).not.toBeInTheDocument()
    expect(confirm).not.toHaveBeenCalled()
  })

  it('removing every item leaves no approval action', async () => {
    revise.mockResolvedValueOnce({ ok: true, result: {
      isSuccess: true, error: null, pendingOperationId: 'pending-1', cancelled: false,
      preview: { changes: [], changeTargetCount: 1, items: [secondItem], previewFingerprint: 'preview-2' },
    } }).mockResolvedValueOnce({ ok: true, result: {
      isSuccess: true, error: null, pendingOperationId: null, preview: null, cancelled: true,
    } })
    render(<PendingOperationCard pendingOperation={preview} onRevise={revise} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.remove Run' }))
    await waitFor(() => expect(screen.queryByText('Run')).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.remove Read' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'chat.operation.approve' })).not.toBeInTheDocument())
    expect(revise).toHaveBeenLastCalledWith('pending-1', { previewFingerprint: 'preview-2', items: [] })
    expect(confirm).not.toHaveBeenCalled()
  })

  it('keeps inferred emoji changes as a plain confirmation', () => {
    render(<PendingOperationCard pendingOperation={makePendingAgentOperation({
      displayName: 'bulk_update_habit_emojis', items: null, previewFingerprint: null,
    })} onRevise={revise} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    expect(screen.queryByRole('button', { name: 'chat.operation.edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'chat.operation.reject' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'chat.operation.approve' })).toBeEnabled()
  })

  it('replaces a same-ID preview and drops its unsaved edit when the fingerprint changes', () => {
    const { rerender } = render(<PendingOperationCard pendingOperation={preview} onRevise={revise} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'chat.operation.edit' })[0]!)
    fireEvent.change(screen.getByRole('textbox', { name: 'chat.operation.field.date' }), { target: { value: '2026-09-30' } })

    const replacement = makePendingAgentOperation({ ...preview, previewFingerprint: 'preview-other', items: [secondItem], changeTargetCount: 1 })
    rerender(<PendingOperationCard pendingOperation={replacement} onRevise={revise} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)

    expect(screen.queryByText('Run')).not.toBeInTheDocument()
    expect(screen.getByText('Read')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'chat.operation.field.date' })).not.toBeInTheDocument()
  })

  it('closes confirmation and blocks its old handler when the preview changes', () => {
    const destructive = makePendingAgentOperation({ ...preview, riskClass: 'Destructive', confirmationRequirement: 'FreshConfirmation' })
    const { rerender } = render(<PendingOperationCard pendingOperation={destructive} onRevise={revise} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.approve' }))
    expect(screen.getByRole('button', { name: 'confirm-sheet' })).toBeInTheDocument()
    const oldConfirm = capturedSheet.onConfirm

    rerender(<PendingOperationCard pendingOperation={{ ...destructive, previewFingerprint: 'preview-2', items: [secondItem] }} onRevise={revise} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)

    expect(screen.queryByRole('button', { name: 'confirm-sheet' })).not.toBeInTheDocument()
    expect(screen.getByText('Read')).toBeInTheDocument()
    oldConfirm?.()
    expect(confirm).not.toHaveBeenCalled()
  })

  it('keeps confirmation open when the preview fingerprint is unchanged', () => {
    const destructive = makePendingAgentOperation({ ...preview, riskClass: 'Destructive', confirmationRequirement: 'FreshConfirmation' })
    const { rerender } = render(<PendingOperationCard pendingOperation={destructive} onRevise={revise} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.approve' }))
    rerender(<PendingOperationCard pendingOperation={{ ...destructive, items: [...destructive.items!] }} onRevise={revise} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    expect(screen.getByRole('button', { name: 'confirm-sheet' })).toBeInTheDocument()
  })

  it('discards prepared step up when the preview changes', async () => {
    prepareStepUp.mockResolvedValue({ ok: true, challengeId: 'challenge-1', confirmationToken: 'confirmation-1' })
    const highRisk = makePendingAgentOperation({ ...preview, riskClass: 'High', confirmationRequirement: 'StepUp' })
    const { rerender } = render(<PendingOperationCard pendingOperation={highRisk} onRevise={revise} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.stepUpAction' }))
    expect(await screen.findByRole('textbox', { name: 'stepUp.codeLabel' })).toBeInTheDocument()

    rerender(<PendingOperationCard pendingOperation={{ ...highRisk, previewFingerprint: 'preview-2', items: [secondItem] }} onRevise={revise} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)

    expect(screen.queryByRole('textbox', { name: 'stepUp.codeLabel' })).not.toBeInTheDocument()
    await capturedVerification.onVerify?.('pending-1', 'challenge-1', '123456', 'confirmation-1')
    expect(verifyStepUp).not.toHaveBeenCalled()
  })

  it('dismisses the step-up sheet before removing it on preview replacement', async () => {
    sheetTestControls.defer(true)
    prepareStepUp.mockResolvedValue({ ok: true, challengeId: 'challenge-1', confirmationToken: 'confirmation-1' })
    const highRisk = makePendingAgentOperation({ ...preview, riskClass: 'High', confirmationRequirement: 'StepUp' })
    const { rerender } = render(<PendingOperationCard pendingOperation={highRisk} onRevise={revise} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.stepUpAction' }))
    expect(await screen.findByRole('textbox', { name: 'stepUp.codeLabel' })).toBeInTheDocument()

    rerender(<PendingOperationCard pendingOperation={{ ...highRisk, previewFingerprint: 'preview-2', items: [secondItem] }} onRevise={revise} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)

    expect(sheetTestControls.isDismissPending).toBe(true)
    expect(screen.getByText('common.cancel').closest('button')).toBeDisabled()
    expect(screen.getByText('stepUp.confirm').closest('button')).toBeDisabled()
    fireEvent.click(screen.getByText('close-overlay'))
    act(() => sheetTestControls.completeDismissal())
    expect(screen.queryByRole('textbox', { name: 'stepUp.codeLabel' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'chat.operation.stepUpAction' })).toBeEnabled()
    expect(verifyStepUp).not.toHaveBeenCalled()
  })

  it('keeps a pending verification response from replacing the stale sheet dismissal', async () => {
    sheetTestControls.defer(true)
    prepareStepUp.mockResolvedValue({ ok: true, challengeId: 'challenge-1', confirmationToken: 'confirmation-1' })
    let resolveVerification!: (result: unknown) => void
    verifyStepUp.mockImplementation(() => new Promise((resolve) => { resolveVerification = resolve }))
    const highRisk = makePendingAgentOperation({ ...preview, riskClass: 'High', confirmationRequirement: 'StepUp' })
    const { rerender } = render(<PendingOperationCard pendingOperation={highRisk} onRevise={revise} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.stepUpAction' }))
    fireEvent.change(await screen.findByRole('textbox', { name: 'stepUp.codeLabel' }), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'stepUp.confirm' }))
    expect(verifyStepUp).toHaveBeenCalledOnce()

    rerender(<PendingOperationCard pendingOperation={{ ...highRisk, previewFingerprint: 'preview-2', items: [secondItem] }} onRevise={revise} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    await act(async () => { resolveVerification({ ok: true, response: { operation: { status: 'Succeeded' } } }) })
    expect(sheetTestControls.isDismissPending).toBe(true)
    act(() => sheetTestControls.completeDismissal())
    expect(screen.queryByRole('textbox', { name: 'stepUp.codeLabel' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'chat.operation.stepUpAction' })).toBeEnabled()
  })

  it('keeps an unsaved edit when switching items', () => {
    render(<PendingOperationCard pendingOperation={preview} onRevise={revise} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'chat.operation.edit' })[0]!)
    fireEvent.change(screen.getByRole('textbox', { name: 'chat.operation.field.date' }), { target: { value: '2026-09-30' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Read' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Run' }))
    expect(screen.getByRole('textbox', { name: 'chat.operation.field.date' })).toHaveValue('2026-09-30')
    expect(screen.queryByRole('textbox', { name: 'common.search' })).not.toBeInTheDocument()
  })

  it('offers search only above the established record filter threshold', () => {
    const items = Array.from({ length: 9 }, (_, index) => ({
      ...firstItem, itemId: `habit-${index}`, entityName: `Habit ${index}`,
    }))
    render(<PendingOperationCard pendingOperation={makePendingAgentOperation({ ...preview, items, changeTargetCount: items.length })} onRevise={revise} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'chat.operation.edit' })[0]!)
    expect(screen.getByRole('textbox', { name: 'common.search' })).toBeInTheDocument()
  })
})
