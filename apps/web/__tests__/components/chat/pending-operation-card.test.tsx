import { personalText } from '@/__tests__/support/personal-text'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeHeldHabitMessage, makePendingAgentOperation, pendingWriteSummaryCases, makePendingWriteSummaryOperation, partialScheduleSummaryCases, makePartialScheduleSummaryOperation } from '@orbit/shared/test-support/chat-fixtures'
import type { PendingOperationExecutionResult, PendingOperationRevisionResponse, PendingOperationStepUpPreparationResult } from '@orbit/shared/hooks'
import { PendingOperationCard } from '@/components/chat/pending-operation-card'
import { sheetTestControls } from '../../support/sheet-double'

const capturedSheet = vi.hoisted(() => ({ onConfirm: undefined as (() => void) | undefined }))
const capturedVerification = vi.hoisted(() => ({ onVerify: undefined as ((id: string, challengeId: string, code: string, token: string) => Promise<unknown>) | undefined }))
const capturedCard = vi.hoisted(() => ({ isCurrent: undefined as (() => boolean) | undefined }))
const visibleLocale = vi.hoisted(() => ({ language: 'en', actual: false }))

function translateVisible(key: string, values?: Record<string, string | number>): string {
  const messages = visibleLocale.language === 'en' ? en : ptBR
  const message = key.split('.').reduce<unknown>((current, segment) => typeof current === 'object' && current !== null ? (current as Record<string, unknown>)[segment] : undefined, messages)
  return typeof message === 'string' ? message.replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name] ?? `{${name}}`)) : key
}

vi.mock('next-intl', () => ({ useLocale: () => visibleLocale.language, useTranslations: () => (key: string, values?: Record<string, string | number>) => {
  if (visibleLocale.actual) return translateVisible(key, values)
  if (key === 'chat.preview.diff') return `${values?.field}: from ${values?.old} to ${values?.new}`
  if (key === 'chat.preview.more') return `and ${values?.count} more`
  if (key === 'chat.action.openEntity') return `Open details: ${values?.name}`
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
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { uses24HourClock: false } }) }))
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
  describe.each(['en', 'pt-BR'])('visible write summaries in %s', (locale) => {
    it.each(pendingWriteSummaryCases)('shows $name', (scenario) => {
      visibleLocale.actual = true
      visibleLocale.language = locale
      const operation = makePendingWriteSummaryOperation(scenario)
      const expected = locale === 'en' ? scenario.english : scenario.portuguese
      render(<PendingOperationCard pendingOperation={operation} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
      expect(screen.getByText(expected)).toBeInTheDocument()
      expect(screen.getAllByText('Read')).toHaveLength(1)
      expect(screen.queryByText(operation.items![0]!.entityId!)).not.toBeInTheDocument()
    })

    it.each(partialScheduleSummaryCases)('shows only the changed schedule fields: $name', (scenario) => {
      visibleLocale.actual = true
      visibleLocale.language = locale
      const operation = makePartialScheduleSummaryOperation(scenario)
      const expected = locale === 'en' ? scenario.english : scenario.portuguese
      render(<PendingOperationCard pendingOperation={operation} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
      expect(screen.getByText(expected)).toBeInTheDocument()
    })
  })

  it('renders one named habit with a cadence instead of field diffs', () => {
    const operation = makeHeldHabitMessage().pendingOperations![0]!
    const item = operation.items![0]!
    const fields = [
      ...item.fields,
      { ...item.fields[0]!, field: 'frequency_unit', newValue: 'Day' },
      { ...item.fields[0]!, field: 'frequency_quantity', newValue: '1', valueType: 'number' },
      { ...item.fields[0]!, field: 'emoji', newValue: '📚' },
    ]
    render(<PendingOperationCard pendingOperation={{ ...operation, changes: fields, items: [{ ...item, fields }] }} onRevise={revise} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    expect(screen.getAllByText(personalText('Beber água'))).toHaveLength(1)
    expect(screen.getByText(/habits.frequency.everyDay/)).toBeInTheDocument()
    expect(screen.queryByText('Day')).not.toBeInTheDocument()
    expect(screen.queryByText(/chat.operation.field/)).not.toBeInTheDocument()
    expect(screen.queryByText(/from .* to/)).not.toBeInTheDocument()
  })

  afterEach(() => sheetTestControls.defer(false))
  beforeEach(() => {
    visibleLocale.actual = false
    visibleLocale.language = 'en'
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

  it.each(['immediate', 'deferred'])('hands step up to a sheet, verifies the code, and executes with %s preparation', async (timing) => {
    const preparation: PendingOperationStepUpPreparationResult = {
      ok: true,
      challengeId: 'challenge-1',
      confirmationToken: 'confirmation-1',
    }
    let resolvePreparation!: (result: PendingOperationStepUpPreparationResult) => void
    prepareStepUp.mockReturnValue(timing === 'immediate' ? Promise.resolve(preparation)
      : new Promise<PendingOperationStepUpPreparationResult>((resolve) => { resolvePreparation = resolve }))
    verifyStepUp.mockResolvedValue({
      ok: true,
      response: { operation: { status: 'Succeeded' } },
    })
    render(<PendingOperationCard pendingOperation={makePendingAgentOperation({ confirmationRequirement: 'StepUp', riskClass: 'High' })} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.stepUpAction' }))
    await waitFor(() => expect(prepareStepUp).toHaveBeenCalledWith('pending-1'))
    if (timing === 'deferred') {
      expect(screen.queryByRole('textbox', { name: 'stepUp.codeLabel' })).not.toBeInTheDocument()
      expect(verifyStepUp).not.toHaveBeenCalled()
    }
    const codeInput = screen.findByRole('textbox', { name: 'stepUp.codeLabel' })
    if (timing === 'deferred') await act(async () => { resolvePreparation(preparation) })
    fireEvent.change(await codeInput, {
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

  it('rejects a legacy preview without executing', () => {
    render(<PendingOperationCard pendingOperation={makePendingAgentOperation()} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.reject' }))
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
    expect(screen.getByText(personalText('Beber água'))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'chat.operation.edit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'chat.operation.reject' })).toBeInTheDocument()
    expect(screen.queryByText(/chat.operation.risk/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.approve' }))
    await waitFor(() => expect(screen.getByText('status.done')).toBeInTheDocument())
    const open = screen.getByRole('button', { name: 'Open details: Beber água' })
    expect(open).toHaveTextContent('chat.action.open')
    fireEvent.click(open)
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

  it.each(['immediate', 'deferred'])('removes one item before approval executes the remaining preview with %s revision', async (timing) => {
    const revision: PendingOperationRevisionResponse = { ok: true, result: {
      isSuccess: true, error: null, pendingOperationId: 'pending-1', cancelled: false,
      preview: { changes: [], changeTargetCount: 1, items: [secondItem], previewFingerprint: 'preview-2' },
    } }
    let resolveRevision!: (result: PendingOperationRevisionResponse) => void
    revise.mockReturnValue(timing === 'immediate' ? Promise.resolve(revision)
      : new Promise<PendingOperationRevisionResponse>((resolve) => { resolveRevision = resolve }))
    confirm.mockResolvedValue({ ok: true, response: { operation: { status: 'Succeeded' } } })
    render(<PendingOperationCard pendingOperation={preview} onRevise={revise} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    expect(confirm).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.remove Run' }))
    await waitFor(() => expect(revise).toHaveBeenCalledWith('pending-1', {
      previewFingerprint: 'preview-1', items: [{ itemId: 'habit-2' }],
    }))
    if (timing === 'deferred') {
      expect(screen.getByText('Run')).toBeInTheDocument()
      expect(screen.getByText('Read')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'chat.operation.approve' })).toBeDisabled()
      expect(confirm).not.toHaveBeenCalled()
      resolveRevision(revision)
    }
    await waitFor(() => {
      expect(screen.queryByText('Run')).not.toBeInTheDocument()
      expect(screen.getByText('Read')).toBeInTheDocument()
      expect(capturedCard.isCurrent?.()).toBe(true)
      expect(screen.getByRole('button', { name: 'chat.operation.approve' })).toBeEnabled()
    })
    expect(revise).toHaveBeenCalledOnce()
    expect(confirm).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.approve' }))
    expect(await screen.findByText('status.done')).toBeInTheDocument()
    expect(screen.queryByText('Run')).not.toBeInTheDocument()
    expect(screen.getByText('Read')).toBeInTheDocument()
    expect(confirm).toHaveBeenCalledExactlyOnceWith('pending-1')
  })

  it.each(['immediate', 'deferred'])('edits one item and sends only the changed field before approval with %s revision', async (timing) => {
    const editedItem = { ...firstItem, fields: [{ ...firstItem.fields[0]!, newValue: '2026-09-27' }] }
    const revision: PendingOperationRevisionResponse = { ok: true, result: {
      isSuccess: true, error: null, pendingOperationId: 'pending-1', cancelled: false,
      preview: { changes: [], changeTargetCount: 2, items: [editedItem, secondItem], previewFingerprint: 'preview-2' },
    } }
    let resolveRevision!: (result: PendingOperationRevisionResponse) => void
    revise.mockReturnValue(timing === 'immediate' ? Promise.resolve(revision)
      : new Promise<PendingOperationRevisionResponse>((resolve) => { resolveRevision = resolve }))
    render(<PendingOperationCard pendingOperation={preview} onRevise={revise} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'chat.operation.edit' })[0]!)
    fireEvent.change(screen.getByRole('textbox', { name: 'chat.operation.field.date' }), { target: { value: '2026-09-27' } })
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))
    await waitFor(() => expect(revise).toHaveBeenCalledWith('pending-1', {
      previewFingerprint: 'preview-1',
      items: [{ itemId: 'habit-1', edits: { date: '2026-09-27' } }, { itemId: 'habit-2' }],
    }))
    expect(confirm).not.toHaveBeenCalled()
    if (timing === 'deferred') {
      expect(screen.queryByText(/chat.operation.edited/)).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'common.save' })).toBeDisabled()
      resolveRevision(revision)
    }
    expect(await screen.findByText(/chat.operation.edited/)).toBeInTheDocument()
    expect(screen.getAllByRole('group', { name: 'chat.preview.proposed' })).toHaveLength(1)
    expect(confirm).not.toHaveBeenCalled()
  })

  it('collapses the rejected preview with no approval action', async () => {
    revise.mockResolvedValue({ ok: true, result: {
      isSuccess: true, error: null, pendingOperationId: null, preview: null, cancelled: true,
    } })
    render(<PendingOperationCard pendingOperation={preview} onRevise={revise} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    const announcement = document.querySelector('[data-preview-rejection-status]')
    expect(announcement).toBeInTheDocument()
    expect(announcement).toBeEmptyDOMElement()
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.reject' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('chat.operation.rejected'))
    expect(screen.getByRole('status')).toBe(announcement)
    expect(screen.queryByText('Run')).not.toBeInTheDocument()
    expect(screen.queryByText('Read')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'chat.operation.refresh' })).not.toBeInTheDocument()
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
    expect(screen.getByRole('button', { name: 'chat.operation.reject' })).toBeEnabled()
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

  it.each(['en', 'pt-BR'])('names the editable item group in %s', (locale) => {
    visibleLocale.actual = true
    visibleLocale.language = locale
    render(<PendingOperationCard pendingOperation={preview} onRevise={revise} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    fireEvent.click(screen.getAllByRole('button', { name: translateVisible('chat.operation.edit') })[0]!)
    expect(screen.getByRole('radiogroup', { name: translateVisible('chat.operation.editTitle') })).toBeInTheDocument()
  })

  it('groups editable items with one tab stop and keyboard selection', async () => {
    const user = userEvent.setup()
    render(<PendingOperationCard pendingOperation={preview} onRevise={revise} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    await user.click(screen.getAllByRole('button', { name: 'chat.operation.edit' })[0]!)
    const group = screen.getByRole('radiogroup', { name: 'chat.operation.editTitle' })
    const run = within(group).getByRole('radio', { name: 'Run' })
    const read = within(group).getByRole('radio', { name: 'Read' })
    expect(run).toHaveAttribute('tabindex', '0')
    expect(read).toHaveAttribute('tabindex', '-1')
    fireEvent.change(screen.getByRole('textbox', { name: 'chat.operation.field.date' }), { target: { value: '2026-09-30' } })
    run.focus()
    await user.keyboard('{ArrowDown}')
    expect(read).toHaveFocus()
    expect(read).toHaveAttribute('aria-checked', 'true')
    expect(read).toHaveAttribute('tabindex', '0')
    expect(run).toHaveAttribute('tabindex', '-1')
    await user.keyboard('{ArrowRight}')
    expect(run).toHaveFocus()
    await user.keyboard('{End}')
    expect(read).toHaveFocus()
    await user.keyboard('{Home}')
    expect(run).toHaveFocus()
    await user.keyboard('{ArrowUp}')
    expect(read).toHaveFocus()
    await user.keyboard('{ArrowLeft}')
    expect(run).toHaveFocus()
    expect(screen.getByRole('textbox', { name: 'chat.operation.field.date' })).toHaveValue('2026-09-30')
    await user.tab()
    expect(screen.getByRole('textbox', { name: 'chat.operation.field.date' })).toHaveFocus()
    expect(revise).not.toHaveBeenCalled()
    await user.click(read)
    expect(read).toHaveAttribute('aria-checked', 'true')
    await user.click(screen.getByRole('button', { name: 'common.cancel' }))
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
  })

  it('retains selection and a valid keyboard entry after filtering editable items', async () => {
    const user = userEvent.setup()
    const items = Array.from({ length: 9 }, (_, index) => ({ ...firstItem, itemId: `habit-${index}`, entityName: `Habit ${index}` }))
    render(<PendingOperationCard pendingOperation={makePendingAgentOperation({ ...preview, items, changeTargetCount: items.length })} onRevise={revise} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    await user.click(screen.getAllByRole('button', { name: 'chat.operation.edit' })[0]!)
    const group = screen.getByRole('radiogroup', { name: 'chat.operation.editTitle' })
    const search = screen.getByRole('textbox', { name: 'common.search' })
    await user.type(search, 'Habit 8')
    const last = within(group).getByRole('radio', { name: 'Habit 8' })
    expect(within(group).getAllByRole('radio')).toHaveLength(1)
    expect(last).toHaveAttribute('aria-checked', 'false')
    expect(last).toHaveAttribute('tabindex', '0')
    await user.tab()
    expect(last).toHaveFocus()
    await user.keyboard(' ')
    expect(last).toHaveAttribute('aria-checked', 'true')
    await user.clear(search)
    expect(within(group).getAllByRole('radio')).toHaveLength(9)
    expect(last).toHaveAttribute('tabindex', '0')
    await user.type(search, 'missing')
    expect(within(group).queryAllByRole('radio')).toHaveLength(0)
    await user.clear(search)
    expect(within(group).getByRole('radio', { name: 'Habit 8' })).toHaveAttribute('aria-checked', 'true')
    expect(within(group).getAllByRole('radio').filter((row) => row.tabIndex === 0)).toHaveLength(1)
  })

  it('keeps grouped items disabled with reasons while saving', async () => {
    let finishRevision!: (result: { ok: false; error: string }) => void
    revise.mockImplementation(() => new Promise((resolve) => { finishRevision = resolve }))
    render(<PendingOperationCard pendingOperation={preview} onRevise={revise} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'chat.operation.edit' })[0]!)
    fireEvent.click(screen.getByRole('radio', { name: 'Read' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'chat.operation.field.date' }), { target: { value: '2026-09-30' } })
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))
    expect(revise).toHaveBeenCalledWith('pending-1', {
      previewFingerprint: 'preview-1', items: [{ itemId: 'habit-1' }, { itemId: 'habit-2', edits: { date: '2026-09-30' } }],
    })
    const group = screen.getByRole('radiogroup', { name: 'chat.operation.editTitle' })
    const rows = within(group).getAllByRole('radio')
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row).toHaveAttribute('aria-disabled', 'true')
      expect(row).toHaveTextContent('blockFrame.status.acting')
      expect(row.tabIndex).toBe(-1)
      fireEvent.click(row)
      fireEvent.keyDown(row, { key: 'ArrowDown' })
    }
    expect(rows[0]).toHaveAttribute('aria-checked', 'false')
    expect(rows[1]).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('button', { name: 'common.cancel' })).toBeDisabled()
    await act(async () => finishRevision({ ok: false, error: 'invalid_revision' }))
    expect(within(group).getByRole('radio', { name: 'Read' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('textbox', { name: 'chat.operation.field.date' })).toHaveValue('2026-09-30')
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

  it('edits due time through a localized TimeField and submits the wire value', async () => {
    const listItem = { ...firstItem, fields: [{ ...firstItem.fields[0]!, field: 'due_time',
      valueType: 'time', newValue: '19:30', proposedValue: '19:30', isEditable: true }] }
    revise.mockResolvedValue({ ok: false, error: 'invalid_revision' })
    render(<PendingOperationCard pendingOperation={makePendingAgentOperation({ ...preview, items: [listItem] })} onRevise={revise} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.edit' }))
    const dueTime = screen.getByRole('textbox', { name: 'chat.operation.field.due_time' })
    expect(dueTime).toHaveValue('7:30 pm')
    fireEvent.change(dueTime, { target: { value: '8:15 PM' } })
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))
    await waitFor(() => expect(revise).toHaveBeenCalledWith('pending-1', {
      previewFingerprint: 'preview-1', items: [{ itemId: 'habit-1', edits: { due_time: '20:15' } }],
    }))
  })

  it('toggles weekday chips and submits the days left selected', async () => {
    const daysItem = { ...firstItem, fields: [{ ...firstItem.fields[0]!, field: 'days', valueType: 'text', newValue: 'Monday' }] }
    revise.mockResolvedValue({ ok: false, error: 'invalid_revision' })
    render(<PendingOperationCard pendingOperation={makePendingAgentOperation({ ...preview, items: [daysItem] })} onRevise={revise} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.edit' }))
    expect(screen.getByRole('button', { name: 'dates.daysLong.monday' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'dates.daysLong.tuesday' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'dates.daysLong.tuesday' }))
    fireEvent.click(screen.getByRole('button', { name: 'dates.daysLong.monday' }))
    expect(screen.getByRole('button', { name: 'dates.daysLong.tuesday' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'dates.daysLong.monday' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))
    await waitFor(() => expect(revise).toHaveBeenCalledWith('pending-1', {
      previewFingerprint: 'preview-1', items: [{ itemId: 'habit-1', edits: { days: ['Tuesday'] } }],
    }))
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
    fireEvent.change(screen.getByRole('textbox', { name: 'chat.operation.field.scheduled_reminders 1: chat.operation.list.time' }), { target: { value: '7:00 PM' } })
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
    let resolveVerification!: (result: PendingOperationExecutionResult) => void
    verifyStepUp.mockImplementation(() => new Promise<PendingOperationExecutionResult>((resolve) => { resolveVerification = resolve }))
    const highRisk = makePendingAgentOperation({ ...preview, riskClass: 'High', confirmationRequirement: 'StepUp' })
    render(<PendingOperationCard pendingOperation={highRisk} onRevise={revise} onRefresh={vi.fn()} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.stepUpAction' }))
    fireEvent.change(await screen.findByRole('textbox', { name: 'stepUp.codeLabel' }), { target: { value: '123456' } })
    const verifyButton = screen.getByRole('button', { name: 'stepUp.confirm' })
    fireEvent.click(verifyButton)
    expect(verifyButton).toBeDisabled()
    expect(sheetTestControls.isDismissPending).toBe(false)
    expect(screen.queryByText('chat.operation.stale')).not.toBeInTheDocument()
    await act(async () => { resolveVerification({ ok: false, error: 'stale_preview', stale: true }) })
    expect(screen.getByText('chat.operation.stale')).toBeInTheDocument()
    expect(sheetTestControls.isDismissPending).toBe(true)
    expect(verifyButton).toBeDisabled()
    act(() => sheetTestControls.completeDismissal())
    expect(sheetTestControls.isDismissPending).toBe(false)
    expect(screen.queryByRole('textbox', { name: 'stepUp.codeLabel' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'chat.operation.stepUpAction' })).not.toBeInTheDocument()
    expect(confirm).not.toHaveBeenCalled()
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
    await waitFor(() => expect(sheetTestControls.isDismissPending).toBe(true))
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

it('discloses full intact names independently of preview mutations', () => {
  confirm.mockClear()
  revise.mockClear()
  const title = 'Ler ' + 'palavralonga'.repeat(12) + ' todos os dias'
  const operation = makeHeldHabitMessage().pendingOperations![0]!
  const item = operation.items![0]!
  const fields = item.fields.map((field) => field.field === 'title' ? { ...field, newValue: title } : field)
  render(<PendingOperationCard pendingOperation={{ ...operation, changes: fields, items: [{ ...item, fields }] }} onRevise={revise} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
  const disclosure = screen.getByRole('button', { name: title })
  expect(disclosure).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(disclosure)
  expect(disclosure).toHaveAttribute('aria-expanded', 'true')
  expect(confirm).not.toHaveBeenCalled()
  expect(revise).not.toHaveBeenCalled()
})
