import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { makeHeldHabitMessage, makePendingAgentOperation } from '@orbit/shared/test-support/chat-fixtures'
import { PendingOperationCard } from '@/components/chat/pending-operation-card'
import { sheetTestControls } from '../../support/sheet-double'

const capturedSheet = vi.hoisted(() => ({ onConfirm: undefined as (() => void) | undefined }))
const capturedVerification = vi.hoisted(() => ({ onVerify: undefined as ((id: string, challengeId: string, code: string, token: string) => Promise<unknown>) | undefined }))
const capturedCard = vi.hoisted(() => ({ isCurrent: undefined as (() => boolean) | undefined }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string, values?: Record<string, string | number>) => {
  if (key === 'chat.preview.diff') return `${values?.field}: from ${values?.old} to ${values?.new}`
  if (key === 'chat.preview.more') return `and ${values?.count} more`
  return key
} }))
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
  it('renders field diffs with accessible old and new values', () => {
    render(<PendingOperationCard pendingOperation={makePendingAgentOperation({
      riskClass: 'Low', confirmationRequirement: 'None',
      changes: [
        { entityId: 'one', entityName: 'Run', field: 'date', oldValue: null, newValue: 'Monday', valueType: 'date' },
        { entityId: 'two', entityName: 'Read', field: 'count', oldValue: '2', newValue: '3', valueType: 'number' },
      ], changeTargetCount: 2,
    })} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    expect(screen.getByText(/from .* to Monday/)).toHaveClass('sr-only')
    expect(screen.getByText(/from 2 to 3/)).toHaveClass('sr-only')
    expect(screen.queryByText('and 1 more')).not.toBeInTheDocument()
  })

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

  it('hides risk and requires a sheet before a destructive operation', async () => {
    confirm.mockResolvedValue({ ok: true, response: { operation: { status: 'Succeeded' } } })
    render(<PendingOperationCard pendingOperation={makePendingAgentOperation()} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)

    expect(screen.queryByText('chat.operation.risk.destructive')).not.toBeInTheDocument()
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

  it('keeps the completed preview and opens its created habit', async () => {
    const onOpenTarget = vi.fn()
    const pendingOperation = makeHeldHabitMessage().pendingOperations![0]!
    confirm.mockResolvedValue({ ok: true, response: { operation: {
      operationId: 'operation-1', sourceName: 'CreateHabit', riskClass: 'Low',
      confirmationRequirement: 'None', status: 'Succeeded', targetId: 'habit-created', targetName: 'Beber água',
    } } })
    render(<PendingOperationCard pendingOperation={pendingOperation} onRevise={revise} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} onOpenTarget={onOpenTarget} />)
    expect(screen.getByText('Beber água')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'chat.operation.edit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'chat.operation.reject' })).toBeInTheDocument()
    expect(screen.queryByText(/chat.operation.risk/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.approve' }))
    await waitFor(() => expect(screen.getByText('status.done')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'chat.action.open' }))
    expect(onOpenTarget).toHaveBeenCalledWith('habit-created', 'CreateHabit')
  })

  it('shows an execution error and lets the same preview retry', async () => {
    confirm.mockResolvedValueOnce({ ok: false, error: 'Could not save. Try again.' })
      .mockResolvedValueOnce({ ok: true, response: { operation: { status: 'Succeeded' } } })
    render(<PendingOperationCard pendingOperation={makeHeldHabitMessage().pendingOperations![0]!} onRevise={revise} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.approve' }))
    await waitFor(() => expect(screen.getByText('status.failed')).toBeInTheDocument())
    expect(screen.getByText('chat.operationFailed')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.approve' }))
    await waitFor(() => expect(screen.getByText('status.done')).toBeInTheDocument())
    expect(confirm).toHaveBeenCalledTimes(2)
  })

  it('keeps a terminal operation failure in the preview with localized status', async () => {
    confirm.mockResolvedValue({ ok: true, response: { operation: { status: 'Failed', summary: 'Habit could not be created.' } } })
    render(<PendingOperationCard pendingOperation={makeHeldHabitMessage().pendingOperations![0]!} onRevise={revise} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.approve' }))
    await waitFor(() => expect(screen.getByText('chat.operationFailed')).toBeInTheDocument())
    expect(screen.queryByText('Habit could not be created.')).not.toBeInTheDocument()
    expect(screen.getByText('status.failed')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'chat.operation.approve' })).not.toBeInTheDocument()
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

  it('edits a complete typed checklist even when the display text is shortened', async () => {
    const checklist = [{ text: 'Pack shoes', is_checked: false }, { text: 'Pack water', is_checked: true }]
    const listItem = { ...firstItem, fields: [{ ...firstItem.fields[0]!, field: 'checklist_items',
      newValue: 'Pack shoes and more', proposedValue: checklist, isEditable: true }] }
    revise.mockResolvedValue({ ok: true, result: { isSuccess: true, error: null,
      pendingOperationId: 'pending-1', cancelled: false,
      preview: { changes: [], changeTargetCount: 1, items: [listItem], previewFingerprint: 'preview-2' } } })
    render(<PendingOperationCard pendingOperation={makePendingAgentOperation({ ...preview, items: [listItem] })} onRevise={revise} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'chat.operation.edit' })[0]!)
    fireEvent.change(screen.getByRole('textbox', { name: 'chat.operation.field.checklist_items 1' }), { target: { value: 'Pack a jacket' } })
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))
    await waitFor(() => expect(revise).toHaveBeenCalledWith('pending-1', {
      previewFingerprint: 'preview-1', items: [{ itemId: 'habit-1', edits: { checklist_items: [
        { text: 'Pack a jacket', is_checked: false }, { text: 'Pack water', is_checked: true },
      ] } }],
    }))
  })

  it('hides editing when the server marks the field non-editable', () => {
    const locked = { ...firstItem, fields: [{ ...firstItem.fields[0]!, isEditable: false, proposedValue: '2026-09-26' }] }
    render(<PendingOperationCard pendingOperation={makePendingAgentOperation({ ...preview, items: [locked] })} onRevise={revise} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    expect(screen.queryByRole('button', { name: 'chat.operation.edit' })).not.toBeInTheDocument()
  })

  it('edits numeric reminder offsets without changing their type', async () => {
    const listItem = { ...firstItem, fields: [{ ...firstItem.fields[0]!, field: 'reminder_times',
      proposedValue: [15, 30], isEditable: true }] }
    revise.mockResolvedValue({ ok: false, error: 'invalid_revision' })
    render(<PendingOperationCard pendingOperation={makePendingAgentOperation({ ...preview, items: [listItem] })} onRevise={revise} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.edit' }))
    const offset = screen.getByRole('spinbutton', { name: 'chat.operation.field.reminder_times 1' })
    expect(offset).toHaveValue(15)
    fireEvent.change(offset, { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))
    await waitFor(() => expect(revise).toHaveBeenCalledWith('pending-1', {
      previewFingerprint: 'preview-1', items: [{ itemId: 'habit-1', edits: { reminder_times: [20, 30] } }],
    }))
    expect(await screen.findByRole('alert')).toHaveTextContent('chat.operation.invalid')
  })

  it('edits scheduled reminder rows and submits the complete typed list', async () => {
    const scheduled = [{ when: 'same_day', time: '08:00' }]
    const listItem = { ...firstItem, fields: [{ ...firstItem.fields[0]!, field: 'scheduled_reminders',
      newValue: 'One reminder', proposedValue: scheduled, isEditable: true }] }
    revise.mockResolvedValue({ ok: false, error: 'invalid_revision' })
    render(<PendingOperationCard pendingOperation={makePendingAgentOperation({ ...preview, items: [listItem] })} onRevise={revise} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.edit' }))
    fireEvent.click(screen.getByRole('radio', { name: 'chat.operation.list.dayBefore' }))
    fireEvent.click(screen.getByRole('radio', { name: 'chat.operation.list.sameDay' }))
    fireEvent.click(screen.getByRole('radio', { name: 'chat.operation.list.dayBefore' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'chat.operation.field.scheduled_reminders 1: chat.operation.list.time' }), { target: { value: '19:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.list.add' }))
    expect(screen.getByRole('textbox', { name: 'chat.operation.field.scheduled_reminders 2: chat.operation.list.time' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.remove chat.operation.field.scheduled_reminders 2' }))
    expect(screen.queryByRole('textbox', { name: 'chat.operation.field.scheduled_reminders 2: chat.operation.list.time' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))
    await waitFor(() => expect(revise).toHaveBeenCalledWith('pending-1', {
      previewFingerprint: 'preview-1', items: [{ itemId: 'habit-1', edits: {
        scheduled_reminders: [{ when: 'day_before', time: '19:00' }],
      } }],
    }))
  })

  it('refreshes a stale preview and closes the old confirmation', async () => {
    const destructive = makePendingAgentOperation({ ...preview, riskClass: 'Destructive', confirmationRequirement: 'FreshConfirmation' })
    revise.mockResolvedValue({ ok: false, error: 'stale_preview', stale: true })
    const refresh = vi.fn().mockResolvedValue({ ok: true, result: { isSuccess: true, error: null,
      pendingOperationId: 'pending-1', cancelled: false,
      preview: { changes: [], changeTargetCount: 1, items: [secondItem], previewFingerprint: 'preview-2' } } })
    render(<PendingOperationCard pendingOperation={destructive} onRevise={revise} onRefresh={refresh} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.approve' }))
    const oldConfirm = capturedSheet.onConfirm
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.remove Run' }))
    await waitFor(() => expect(screen.getByText('chat.operation.stale')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'chat.operation.approve' })).not.toBeInTheDocument()
    oldConfirm?.()
    expect(confirm).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.refresh' }))
    await waitFor(() => expect(refresh).toHaveBeenCalledWith('pending-1'))
    await waitFor(() => expect(screen.getByText('Read')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'confirm-sheet' })).not.toBeInTheDocument()
    oldConfirm?.()
    expect(confirm).not.toHaveBeenCalled()
  })

  it('requires a new confirmation after refresh returns the same fingerprint', async () => {
    const destructive = makePendingAgentOperation({ ...preview, riskClass: 'Destructive', confirmationRequirement: 'FreshConfirmation' })
    revise.mockResolvedValue({ ok: false, error: 'stale_preview', stale: true })
    const refresh = vi.fn().mockResolvedValue({ ok: true, result: { isSuccess: true, error: null,
      pendingOperationId: 'pending-1', cancelled: false,
      preview: { changes: [], changeTargetCount: 2, items: [firstItem, secondItem], previewFingerprint: 'preview-1' } } })
    render(<PendingOperationCard pendingOperation={destructive} onRevise={revise} onRefresh={refresh} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.approve' }))
    const oldConfirm = capturedSheet.onConfirm
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.remove Run' }))
    await waitFor(() => expect(screen.getByText('chat.operation.stale')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.refresh' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'chat.operation.approve' })).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'confirm-sheet' })).not.toBeInTheDocument()
    oldConfirm?.()
    expect(confirm).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.approve' }))
    expect(screen.getByRole('button', { name: 'confirm-sheet' })).toBeInTheDocument()
  })

  it('dismisses the identity sheet when verification reports stale', async () => {
    sheetTestControls.defer(true)
    prepareStepUp.mockResolvedValue({ ok: true, challengeId: 'challenge-1', confirmationToken: 'confirmation-1' })
    verifyStepUp.mockResolvedValue({ ok: false, error: 'stale_preview', stale: true })
    const highRisk = makePendingAgentOperation({ ...preview, riskClass: 'High', confirmationRequirement: 'StepUp' })
    render(<PendingOperationCard pendingOperation={highRisk} onRevise={revise} onRefresh={vi.fn()} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.stepUpAction' }))
    fireEvent.change(await screen.findByRole('textbox', { name: 'stepUp.codeLabel' }), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'stepUp.confirm' }))
    await waitFor(() => expect(screen.getByText('chat.operation.stale')).toBeInTheDocument())
    expect(sheetTestControls.isDismissPending).toBe(true)
    expect(screen.getByText('stepUp.confirm').closest('button')).toBeDisabled()
    act(() => sheetTestControls.completeDismissal())
    expect(screen.queryByRole('textbox', { name: 'stepUp.codeLabel' })).not.toBeInTheDocument()
  })

  it('discards prepared identity approval after refresh returns the same fingerprint', async () => {
    sheetTestControls.defer(true)
    prepareStepUp.mockResolvedValue({ ok: true, challengeId: 'challenge-1', confirmationToken: 'confirmation-1' })
    revise.mockResolvedValue({ ok: false, error: 'stale_preview', stale: true })
    const refresh = vi.fn().mockResolvedValue({ ok: true, result: { isSuccess: true, error: null,
      pendingOperationId: 'pending-1', cancelled: false,
      preview: { changes: [], changeTargetCount: 2, items: [firstItem, secondItem], previewFingerprint: 'preview-1' } } })
    const highRisk = makePendingAgentOperation({ ...preview, riskClass: 'High', confirmationRequirement: 'StepUp' })
    render(<PendingOperationCard pendingOperation={highRisk} onRevise={revise} onRefresh={refresh} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.stepUpAction' }))
    expect(await screen.findByRole('textbox', { name: 'stepUp.codeLabel' })).toBeInTheDocument()
    const oldVerify = capturedVerification.onVerify
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.remove Run' }))
    await waitFor(() => expect(screen.getByText('chat.operation.stale')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.refresh' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'chat.operation.stepUpAction' })).toBeInTheDocument())
    expect(sheetTestControls.isDismissPending).toBe(true)
    act(() => sheetTestControls.completeDismissal())
    await oldVerify?.('pending-1', 'challenge-1', '123456', 'confirmation-1')
    expect(verifyStepUp).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox', { name: 'stepUp.codeLabel' })).not.toBeInTheDocument()
  })

  it('keeps approval blocked after refresh returns conflict', async () => {
    revise.mockResolvedValue({ ok: false, error: 'stale_preview', stale: true })
    const refresh = vi.fn().mockResolvedValue({ ok: false, error: 'revision_conflict', stale: true })
    render(<PendingOperationCard pendingOperation={preview} onRevise={revise} onRefresh={refresh} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.remove Run' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'chat.operation.refresh' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.refresh' }))
    await waitFor(() => expect(screen.getByText('chat.operation.staleUnavailable')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'chat.operation.refresh' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'chat.operation.approve' })).not.toBeInTheDocument()
    expect(confirm).not.toHaveBeenCalled()
  })

  it('offers refresh after approval finds a stale preview', async () => {
    confirm.mockResolvedValue({ ok: false, error: 'stale_preview', stale: true })
    render(<PendingOperationCard pendingOperation={preview} onRevise={revise} onRefresh={vi.fn()} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.approve' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'chat.operation.refresh' })).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'chat.operation.approve' })).not.toBeInTheDocument()
  })
})
