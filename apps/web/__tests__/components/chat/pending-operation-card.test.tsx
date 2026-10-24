import { resolveParentChoicePreview, makeParentChoicePreview, makeBulkCreateExecutionResponse, makeCreateHabitsPreview, makeMixedHabitsPreview, makeDeleteHabitsPreview } from '@orbit/shared/test-support/pending-operation-preview-fixtures'
import { IntlMessageFormat } from 'intl-messageformat'
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
  return typeof message === 'string' ? new IntlMessageFormat(message, visibleLocale.language).format(values) as string : key
}

vi.mock('next-intl', () => ({ useLocale: () => visibleLocale.language, useTranslations: (namespace?: string) => (key: string, values?: Record<string, string | number>) => {
  if (visibleLocale.actual) return translateVisible(namespace ? `${namespace}.${key}` : key, values)
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
  ConfirmSheet: ({ open, onConfirm, title, message, confirmLabel, destructive }: { open: boolean; onConfirm: () => void; title: string; message: string; confirmLabel: string; destructive: boolean }) =>
    open ? (capturedSheet.onConfirm = onConfirm, <div role="dialog" aria-label={title} data-destructive={destructive}><button type="button" onClick={onConfirm}>confirm-sheet</button><p>{message}</p><span>{confirmLabel}</span></div>) : null,
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
  it.each([0, null, undefined].flatMap(count => ['en', 'pt-BR'].map(locale => ({ count, locale }))))('renders a zero-target preview as a notice without approval with count $count in $locale', ({ count, locale }) => {
    visibleLocale.actual = true
    visibleLocale.language = locale
    render(<PendingOperationCard pendingOperation={{ ...makeCreateHabitsPreview(0), changeTargetCount: count }} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent((locale === 'en' ? en : ptBR).chat.operation.empty)
    expect(confirm).not.toHaveBeenCalled()
  })

  it.each(['done', 'failed'] as const)('keeps an empty operation settled as %s with its recovery', async status => {
    const operation = { ...makeCreateHabitsPreview(0), changeTargetCount: null, changes: [] }
    render(<PendingOperationCard pendingOperation={operation} savedState={{ status, canRetry: status === 'failed' }} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    expect(screen.queryByText('chat.operation.empty')).not.toBeInTheDocument()
    if (status === 'done') {
      expect(screen.getByText('status.done')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'common.retry' })).not.toBeInTheDocument()
    } else {
      expect(screen.getByText('chat.operationFailed')).toBeInTheDocument()
      confirm.mockReturnValue(new Promise(() => {}))
      fireEvent.click(screen.getByRole('button', { name: 'common.retry' }))
      await waitFor(() => expect(confirm).toHaveBeenCalledWith(operation.id))
    }
  })

  it.each([null, undefined])('keeps plain confirmation when the producer has no item preview: %s', items => {
    const operation = { ...makeCreateHabitsPreview(1), items, changes: null, changeTargetCount: null }
    render(<PendingOperationCard pendingOperation={operation} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    expect(screen.getByRole('button', { name: /chat.operation.approveCount/ })).toBeInTheDocument()
  })

  it('disables every preview action and announces busy during deletion', async () => {
    confirm.mockReturnValue(new Promise(() => {}))
    const { container } = render(<PendingOperationCard pendingOperation={makeDeleteHabitsPreview(10)} onRevise={revise} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    fireEvent.click(container.querySelector('button[data-variant="primary"]')!)
    fireEvent.click(screen.getByRole('button', { name: 'confirm-sheet' }))
    await waitFor(() => expect(screen.getAllByText('status.acting')).toHaveLength(10))
    for (const button of container.querySelectorAll('[data-action-row] button, button[aria-label^="chat.operation.remove"]')) expect(button).toBeDisabled()
    expect(container.querySelector('[data-state="acting"]')).toHaveAttribute('aria-busy', 'true')
    expect(confirm).toHaveBeenCalledOnce()
  })

  it('clears a failed removal on stale approval before reporting an actual refresh failure', async () => {
    confirm.mockResolvedValue({ ok: false, stale: true, error: 'stale_preview' })
    const refresh = vi.fn().mockResolvedValue({ ok: false, error: 'network_error' })
    revise.mockResolvedValue({ ok: false, error: 'network_error' })
    render(<PendingOperationCard pendingOperation={preview} onRevise={revise} onRefresh={refresh} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.remove Run' }))
    await screen.findByText('chat.operation.invalid')
    expect(confirm).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.approve' }))
    await screen.findByRole('button', { name: 'chat.operation.refresh' })
    expect(refresh).not.toHaveBeenCalled()
    expect(screen.getAllByText('chat.operation.stale')).toHaveLength(1)
    expect(screen.queryByText('chat.operation.refreshFailed')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.refresh' }))
    await screen.findByText('chat.operation.refreshFailed')
    expect(screen.getAllByText('chat.operation.refreshFailed')).toHaveLength(1)
    expect(screen.queryByText('chat.operation.stale')).not.toBeInTheDocument()
    expect(screen.queryByText('chat.operationFailed')).not.toBeInTheDocument()
  })


  describe.each(['en', 'pt-BR'])('batch recovery in %s', (locale) => {
    it('retries the same batch after a producer pre-write failure without failing unrun rows', async () => {
      visibleLocale.actual = true
      visibleLocale.language = locale
      const operation = makeCreateHabitsPreview(2)
      const messages = locale === 'en' ? en : ptBR
      confirm.mockResolvedValueOnce({ ok: true, response: makeBulkCreateExecutionResponse() })
        .mockResolvedValueOnce({ ok: true, response: makeBulkCreateExecutionResponse(['Success', 'Success']) })
      const onStateChange = vi.fn()
      render(<PendingOperationCard pendingOperation={operation} onStateChange={onStateChange} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
      fireEvent.click(screen.getByRole('button', { name: locale === 'en' ? 'Create 2 habits' : 'Criar 2 hábitos' }))
      const retry = await screen.findByRole('button', { name: messages.common.retry })
      expect(screen.queryByText(messages.blockFrame.status.failed)).not.toBeInTheDocument()
      expect(screen.getByText(messages.chat.operationFailed)).toBeInTheDocument()
      expect(onStateChange).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'failed', canRetry: true }))
      fireEvent.click(retry)
      await waitFor(() => expect(screen.getAllByText(messages.blockFrame.status.done)).toHaveLength(2))
      expect(confirm.mock.calls).toEqual([[operation.id], [operation.id]])
      expect(screen.queryByRole('button', { name: messages.common.retry })).not.toBeInTheDocument()
    })

    it.each([['Success', 'Failed'], ['Failed', 'Failed']] as const)('shows producer item outcomes %s and %s without retrying a consumed batch', async (first, second) => {
      visibleLocale.actual = true
      visibleLocale.language = locale
      const operation = makeCreateHabitsPreview(2)
      const messages = locale === 'en' ? en : ptBR
      const onOpenTarget = vi.fn()
      confirm.mockResolvedValue({ ok: true, response: makeBulkCreateExecutionResponse([first, second]) })
      render(<PendingOperationCard pendingOperation={operation} onOpenTarget={onOpenTarget} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
      fireEvent.click(screen.getByRole('button', { name: locale === 'en' ? 'Create 2 habits' : 'Criar 2 hábitos' }))
      await waitFor(() => expect(screen.getByText(personalText('Habit 2')).closest('[data-status]')).toHaveAttribute('data-status', 'failed'))
      const firstRow = screen.getByText(personalText('Habit 1')).closest('[data-status]')! as HTMLElement
      expect(firstRow).toHaveAttribute('data-status', first === 'Success' ? 'done' : 'failed')
      expect(screen.queryByRole('button', { name: messages.common.retry })).not.toBeInTheDocument()
      expect(screen.queryByText(messages.chat.operationFailed)).not.toBeInTheDocument()
      expect(screen.getByText(messages.chat.operation.batchFailed)).toBeInTheDocument()
      if (first === 'Success') {
        fireEvent.click(within(firstRow).getByRole('button', { name: translateVisible('chat.action.openEntity', { name: 'Habit 1' }) }))
        expect(onOpenTarget).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000020', 'CreateHabit')
      }
    })
  })

  describe.each(['en', 'pt-BR'])('operation approval in %s', (locale) => {
    it.each(['Low', 'Destructive', 'High'] as const)('approves creation directly with %s internal risk', async (riskClass) => {
      visibleLocale.actual = true
      visibleLocale.language = locale
      const operation = { ...makeCreateHabitsPreview(), riskClass }
      confirm.mockResolvedValue({ ok: true, response: { operation: { status: 'Succeeded' } } })
      render(<PendingOperationCard pendingOperation={operation} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
      const messages = locale === 'en' ? en : ptBR
      expect(screen.queryByText(messages.chat.operation.irreversible)).not.toBeInTheDocument()
      expect(screen.queryByText(messages.chat.operation.confirmNote)).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: locale === 'en' ? 'Create 12 habits' : 'Criar 12 hábitos' }))
      await waitFor(() => expect(confirm).toHaveBeenCalledWith(operation.id))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('updates the action count after removing a proposed habit', async () => {
      visibleLocale.actual = true
      visibleLocale.language = locale
      const operation = makeCreateHabitsPreview()
      const items = operation.items!.slice(1)
      revise.mockResolvedValue({ ok: true, result: { isSuccess: true, error: null, pendingOperationId: operation.id,
        cancelled: false, preview: { changes: [], items, changeTargetCount: 11, previewFingerprint: 'revised-create' } } })
      render(<PendingOperationCard pendingOperation={operation} onRevise={revise} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
      fireEvent.click(screen.getByRole('button', { name: `${locale === 'en' ? 'Remove' : 'Remover'} Habit 1` }))
      await screen.findByRole('button', { name: locale === 'en' ? 'Create 11 habits' : 'Criar 11 hábitos' })
      expect(screen.queryByRole('button', { name: locale === 'en' ? 'Create 12 habits' : 'Criar 12 hábitos' })).not.toBeInTheDocument()
    })

    it('approves the remaining creation directly after removing the last deletion', async () => {
      visibleLocale.actual = true
      visibleLocale.language = locale
      const mixed = makeMixedHabitsPreview()
      const items = mixed.items!.slice(0, 2)
      const operation = { ...mixed, items: mixed.items!.slice(0, 3), changeTargetCount: 3 }
      revise.mockResolvedValue({ ok: true, result: { isSuccess: true, error: null, pendingOperationId: operation.id,
        cancelled: false, preview: { changes: [], items, changeTargetCount: 2, previewFingerprint: 'revised-mixed' } } })
      confirm.mockResolvedValue({ ok: true, response: { operation: { status: 'Succeeded' } } })
      render(<PendingOperationCard pendingOperation={operation} onRevise={revise} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
      fireEvent.click(screen.getByRole('button', { name: `${locale === 'en' ? 'Remove' : 'Remover'} Old habit 1` }))
      fireEvent.click(await screen.findByRole('button', { name: locale === 'en' ? 'Create 2 habits' : 'Criar 2 hábitos' }))
      await waitFor(() => expect(confirm).toHaveBeenCalledWith(operation.id))
      const messages = locale === 'en' ? en : ptBR
      expect(screen.queryByText(messages.chat.operation.irreversible)).not.toBeInTheDocument()
      expect(screen.queryByText(messages.chat.operation.confirmNote)).not.toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('marks only delete rows and confirms their count', () => {
      visibleLocale.actual = true
      visibleLocale.language = locale
      const operation = makeMixedHabitsPreview()
      render(<PendingOperationCard pendingOperation={operation} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
      const messages = locale === 'en' ? en : ptBR
      expect(screen.getAllByText(messages.chat.operation.irreversible)).toHaveLength(3)
      for (const item of operation.items!) {
        const row = screen.getByText(personalText(item.entityName)).closest('[data-proposed]')! as HTMLElement
        expect(within(row).queryByText(messages.chat.operation.irreversible) !== null).toBe(item.removesData === true)
      }
      expect(screen.getByText(messages.chat.operation.confirmNote)).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: messages.chat.pendingOp.action.applyChanges }))
      expect(confirm).not.toHaveBeenCalled()
      expect(screen.getByRole('dialog', { name: locale === 'en' ? 'Delete habits?' : 'Apagar hábitos?' })).toHaveAttribute('data-destructive', 'true')
      expect(screen.getByText(locale === 'en' ? '3 habits and everything inside them leave your list. There is no way to restore this here.' : '3 hábitos e tudo o que há neles serão removidos da sua lista. Não há como restaurar por aqui.')).toBeInTheDocument()
      expect(screen.getByText(locale === 'en' ? 'Delete habits' : 'Apagar hábitos')).toBeInTheDocument()
    })
  })

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
    render(<PendingOperationCard pendingOperation={makePendingAgentOperation({ items: [{ ...firstItem, removesData: true }] })} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)

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
    await waitFor(() => expect(screen.getByText('chat.operation.status.Denied')).toBeInTheDocument())
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
    await waitFor(() => expect(screen.getByText('chat.operationFailed')).toBeInTheDocument())
    expect(screen.queryByText('status.failed')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }))
    await waitFor(() => expect(screen.getByText('status.done')).toBeInTheDocument())
    expect(confirm).toHaveBeenCalledTimes(2)
  })

  it('keeps a terminal operation failure in the preview with localized status', async () => {
    confirm.mockResolvedValue({ ok: true, response: { operation: { status: 'Failed', summary: 'Habit could not be created.' } } })
    render(<PendingOperationCard pendingOperation={makeHeldHabitMessage().pendingOperations![0]!} onRevise={revise} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.approve' }))
    await waitFor(() => expect(screen.getByText('chat.operation.unavailableRecovery')).toBeInTheDocument())
    expect(screen.queryByText('Habit could not be created.')).not.toBeInTheDocument()
    expect(screen.queryByText('status.failed')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'common.retry' })).not.toBeInTheDocument()
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
    const destructive = makePendingAgentOperation({ ...preview, items: preview.items!.map((item) => ({ ...item, removesData: true })), riskClass: 'Destructive', confirmationRequirement: 'FreshConfirmation' })
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
    const destructive = makePendingAgentOperation({ ...preview, items: preview.items!.map((item) => ({ ...item, removesData: true })), riskClass: 'Destructive', confirmationRequirement: 'FreshConfirmation' })
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

  it('shows one boolean editor label inside the switch and preserves its draft while saving', async () => {
    const booleanItem = { ...firstItem, fields: [{ ...firstItem.fields[0]!, field: 'reminder_enabled', valueType: 'boolean', newValue: 'true', proposedValue: true, isEditable: true }] }
    let finishRevision!: (result: PendingOperationRevisionResponse) => void
    revise.mockImplementation(() => new Promise((resolve) => { finishRevision = resolve }))
    render(<PendingOperationCard pendingOperation={makePendingAgentOperation({ ...preview, items: [booleanItem], changeTargetCount: 1 })} onRevise={revise} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.edit' }))
    const body = screen.getByRole('dialog', { name: 'chat.operation.editTitle: Run' })
    const label = 'chat.operation.field.reminder_enabled'
    expect(within(body).getAllByText(label)).toHaveLength(1)
    const control = within(body).getByRole('switch', { name: label })
    expect(within(control).getByText(label)).toBeInTheDocument()
    expect(control).toBeChecked()
    fireEvent.click(control)
    expect(control).not.toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))
    expect(revise).toHaveBeenCalledWith('pending-1', {
      previewFingerprint: 'preview-1', items: [{ itemId: 'habit-1', edits: { reminder_enabled: false } }],
    })
    expect(control).toBeDisabled()
    await act(async () => { finishRevision({ ok: false, error: 'invalid_revision' }) })
    expect(control).toBeEnabled()
    expect(control).not.toBeChecked()
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
      expect(row).toHaveAccessibleName(/blockFrame.status.acting/)
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
    const destructive = makePendingAgentOperation({ ...preview, items: preview.items!.map((item) => ({ ...item, removesData: true })), riskClass: 'Destructive', confirmationRequirement: 'FreshConfirmation' })
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
    const destructive = makePendingAgentOperation({ ...preview, items: preview.items!.map((item) => ({ ...item, removesData: true })), riskClass: 'Destructive', confirmationRequirement: 'FreshConfirmation' })
    revise.mockResolvedValue({ ok: false, error: 'stale_preview', stale: true })
    const refresh = vi.fn().mockResolvedValue({ ok: true, result: { isSuccess: true, error: null,
      pendingOperationId: 'pending-1', cancelled: false,
      preview: { changes: [], changeTargetCount: 2, items: [firstItem, secondItem].map((item) => ({ ...item, removesData: true })), previewFingerprint: 'preview-1' } } })
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

it('renames a proposed title inline, cancels with Escape and retains the full editor', async () => {
  confirm.mockClear()
  revise.mockClear()
  const operation = makeCreateHabitsPreview(2)
  const revised = makeCreateHabitsPreview(2)
  revised.previewFingerprint = 'renamed-preview'
  revised.items![0]!.entityName = 'Read books'
  revised.items![0]!.fields[0]!.newValue = 'Read books'
  revised.items![0]!.fields[0]!.proposedValue = 'Read books'
  revise.mockResolvedValue({ ok: true, result: { isSuccess: true, cancelled: false, pendingOperationId: operation.id, error: null, preview: revised } })
  confirm.mockResolvedValue({ ok: true })
  render(<PendingOperationCard pendingOperation={operation} onRevise={revise} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
  const title = screen.getByRole('button', { name: 'Habit 1' })
  expect(title).not.toHaveAttribute('aria-expanded')
  fireEvent.click(title)
  let input = screen.getByRole('textbox', { name: 'chat.operation.field.title' })
  fireEvent.change(input, { target: { value: 'Discard me' } })
  fireEvent.keyDown(input, { key: 'Escape' })
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  expect(revise).not.toHaveBeenCalled()
  expect.soft(screen.getByRole('button', { name: 'Habit 1' })).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'Habit 1' }))
  input = screen.getByRole('textbox', { name: 'chat.operation.field.title' })
  expect(input).toHaveValue('Habit 1')
  fireEvent.change(input, { target: { value: 'Read books' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  fireEvent.blur(input)
  expect.soft(await screen.findByRole('button', { name: 'Read books' })).toHaveFocus()
  expect(revise).toHaveBeenCalledExactlyOnceWith(operation.id, { previewFingerprint: 'create-preview', items: [{ itemId: '0', edits: { title: 'Read books' } }, { itemId: '1' }] })
  expect(confirm).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'chat.operation.edit' }))
  expect(screen.getByRole('textbox', { name: 'chat.operation.field.title' })).toHaveValue('Read books')
  fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }))
  fireEvent.click(screen.getByRole('button', { name: 'chat.operation.approveCount.createHabits' }))
  await waitFor(() => expect(confirm).toHaveBeenCalledWith(operation.id))
})

it.each(['en', 'pt-BR'])('shows icons beside readable titles without chevrons or icon instructions in %s', locale => {
  visibleLocale.language = locale
  visibleLocale.actual = true
  const operation = makeCreateHabitsPreview(1)
  const item = operation.items![0]!
  item.fields.push({ ...item.fields[0]!, field: 'emoji', newValue: '🩺', proposedValue: '🩺' })
  const { container } = render(<PendingOperationCard pendingOperation={operation} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
  expect(screen.getByText('🩺').parentElement).toHaveTextContent('Habit 1')
  expect(screen.getByRole('button', { name: 'Habit 1' })).toHaveAttribute('aria-expanded', 'false')
  expect(screen.getByText('🩺').parentElement?.querySelector('svg')).toBeNull()
  expect(container.textContent).not.toMatch(/Usar 🩺|Use 🩺/)
})

it('submits a title revision on blur and preserves a failed draft for retry', async () => {
  confirm.mockClear()
  visibleLocale.actual = false
  const operation = makeCreateHabitsPreview(1)
  const reviseTitle = vi.fn().mockResolvedValue({ ok: false, error: 'invalid_revision' })
  render(<PendingOperationCard pendingOperation={operation} onRevise={reviseTitle} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
  fireEvent.click(screen.getByRole('button', { name: 'Habit 1' }))
  const input = screen.getByRole('textbox', { name: 'chat.operation.field.title' })
  fireEvent.change(input, { target: { value: 'Read books' } })
  fireEvent.blur(input)
  await waitFor(() => expect(reviseTitle).toHaveBeenCalledExactlyOnceWith(operation.id, { previewFingerprint: 'create-preview', items: [{ itemId: '0', edits: { title: 'Read books' } }] }))
  await waitFor(() => expect(input).toBeEnabled())
  expect(input).toHaveValue('Read books')
  const approve = screen.getByRole('button', { name: 'chat.operation.approveCount.createHabits' })
  expect(screen.getByText('chat.operation.invalid')).toBeInTheDocument()
  expect(approve).toBeDisabled()
  fireEvent.click(approve)
  expect(confirm).not.toHaveBeenCalled()
  fireEvent.change(input, { target: { value: 'Habit 1' } })
  expect(approve).toBeEnabled()
  fireEvent.change(input, { target: { value: 'Read books' } })
  expect(approve).toBeDisabled()
  const revised = makeCreateHabitsPreview(1)
  revised.previewFingerprint = 'accepted-title'
  revised.items![0]!.entityName = 'Read books'
  revised.items![0]!.fields[0]!.newValue = 'Read books'
  revised.items![0]!.fields[0]!.proposedValue = 'Read books'
  reviseTitle.mockResolvedValue({ ok: true, result: { isSuccess: true, cancelled: false, pendingOperationId: operation.id, error: null, preview: revised } })
  fireEvent.keyDown(input, { key: 'Enter' })
  await screen.findByRole('button', { name: 'Read books' })
  expect(approve).toBeEnabled()
})

it('discards an unmounted title draft after refreshing a stale rename with the same item id', async () => {
  visibleLocale.actual = false
  confirm.mockClear()
  confirm.mockResolvedValue({ ok: true })
  const operation = makeCreateHabitsPreview(1)
  const refreshed = { ...makeCreateHabitsPreview(1), previewFingerprint: 'refreshed-preview' }
  const reviseTitle = vi.fn().mockResolvedValue({ ok: false, stale: true, error: 'stale_preview' })
  const refresh = vi.fn().mockResolvedValue({ ok: true, result: { isSuccess: true, cancelled: false, pendingOperationId: operation.id, error: null, preview: refreshed } })
  render(<PendingOperationCard pendingOperation={operation} onRevise={reviseTitle} onRefresh={refresh} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
  fireEvent.click(screen.getByRole('button', { name: 'Habit 1' }))
  const input = screen.getByRole('textbox', { name: 'chat.operation.field.title' })
  fireEvent.change(input, { target: { value: 'Discarded draft' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  fireEvent.click(await screen.findByRole('button', { name: 'chat.operation.refresh' }))
  await screen.findByRole('button', { name: 'Habit 1' })
  expect(refresh).toHaveBeenCalledExactlyOnceWith(operation.id)
  expect(refreshed.items![0]!.itemId).toBe(operation.items![0]!.itemId)
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  const approve = screen.getByRole('button', { name: 'chat.operation.approveCount.createHabits' })
  expect(approve).toBeEnabled()
  fireEvent.click(approve)
  await waitFor(() => expect(confirm).toHaveBeenCalledWith(operation.id))
})

it('reveals full deletion names without opening the rename editor', () => {
  revise.mockClear()
  const operation = makeDeleteHabitsPreview(2)
  const names = ['Read every book about the places around the world before breakfast in the kitchen', 'Read every book about the places around the world before breakfast on the balcony']
  operation.items!.forEach((item, index) => { item.entityName = names[index]! })
  const { container } = render(<PendingOperationCard pendingOperation={operation} onRevise={revise} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
  for (const name of names) {
    const control = screen.getByRole('button', { name })
    fireEvent.click(control)
    expect(container.querySelector('[data-personal-text-expanded]')).toHaveTextContent(name)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    fireEvent.click(control)
  }
  expect(revise).not.toHaveBeenCalled()
})

describe('parent choice previews', () => {
  beforeEach(() => { visibleLocale.actual = false; visibleLocale.language = 'en'; revise.mockReset(); confirm.mockReset() })
  it.each(['en', 'pt-BR'])('requires only offered parents before approval in %s', async locale => {
    visibleLocale.actual = true
    visibleLocale.language = locale
    const operation = makeParentChoicePreview()
    render(<PendingOperationCard pendingOperation={operation} onRevise={revise} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    expect(screen.getAllByRole('radiogroup')).toHaveLength(2)
    expect(screen.getAllByRole('radio')).toHaveLength(6)
    const approve = () => screen.getByRole('button', { name: locale === 'en' ? 'Create 2 habits' : 'Criar 2 hábitos' })
    expect(approve()).toBeDisabled()
    expect(approve()).toHaveAccessibleDescription(locale === 'en' ? 'Before approving, choose a parent or “No parent” where options are shown.' : 'Antes de aprovar, escolha um hábito principal ou “Sem hábito principal” onde houver opções.')
    fireEvent.click(screen.getAllByRole('radio', { name: 'Post Lunch' })[0]!)
    expect(revise).toHaveBeenCalledWith(operation.id, { previewFingerprint: operation.previewFingerprint, items: [
      { itemId: '0', edits: { parent_habit_id: '11111111-1111-1111-1111-111111111111' } }, { itemId: '1' },
    ] })
  })
})

describe('parent choice revision', () => {
  beforeEach(() => { visibleLocale.actual = false; visibleLocale.language = 'en'; revise.mockReset(); confirm.mockReset() })
  it.each(['11111111-1111-1111-1111-111111111111', null])('resolves every item through revision, including %s', async value => {
    const operation = makeParentChoicePreview()
    let accepted = operation
    revise.mockImplementation((_id, request) => {
      const edit = request.items.find((item: { edits?: Record<string, unknown> }) => item.edits)
      accepted = resolveParentChoicePreview(accepted, edit.itemId, edit.edits.parent_habit_id)
      return Promise.resolve({ ok: true, result: { isSuccess: true, error: null, pendingOperationId: operation.id, preview: accepted, cancelled: false } })
    })
    confirm.mockResolvedValue({ ok: true })
    const settled = vi.fn()
    render(<PendingOperationCard pendingOperation={operation} onRevise={revise} onStateChange={settled} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    const choose = () => value === null ? screen.getAllByRole('radio', { name: 'habits.moveParent.toRoot' })[0]! : screen.getAllByRole('radio', { name: 'Post Lunch' })[0]!
    fireEvent.click(choose())
    await waitFor(() => expect(screen.getAllByRole('radiogroup')).toHaveLength(1))
    expect(screen.getByRole('button', { name: /approveCount/ })).toBeDisabled()
    expect(settled).toHaveBeenLastCalledWith(expect.objectContaining({ operation: expect.objectContaining({ previewFingerprint: accepted.previewFingerprint }) }))
    fireEvent.click(choose())
    await waitFor(() => expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument())
    expect(revise).toHaveBeenLastCalledWith(operation.id, { previewFingerprint: 'parent-choice-preview-0', items: [{ itemId: '0' }, { itemId: '1', edits: { parent_habit_id: value } }] })
    fireEvent.click(screen.getByRole('button', { name: /approveCount/ }))
    await waitFor(() => expect(confirm).toHaveBeenCalledWith(operation.id))
  })

  it('shows a resolved parent name without choices', () => {
    const operation = resolveParentChoicePreview(makeParentChoicePreview(1), '0', '11111111-1111-1111-1111-111111111111')
    render(<PendingOperationCard pendingOperation={operation} onRevise={revise} onConfirmExecute={confirm} onPrepareStepUp={prepareStepUp} onVerifyStepUp={verifyStepUp} />)
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
    expect(screen.getByText(/Post Lunch/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /approveCount/ })).toBeEnabled()
  })

  it('discards a late choice response after replacement', async () => {
    const operation = makeParentChoicePreview(1)
    const settled = vi.fn()
    let finish!: (response: PendingOperationRevisionResponse) => void
    revise.mockReturnValue(new Promise<PendingOperationRevisionResponse>(resolve => { finish = resolve }))
    const props = { onRevise: revise, onStateChange: settled, onConfirmExecute: confirm, onPrepareStepUp: prepareStepUp, onVerifyStepUp: verifyStepUp }
    const view = render(<PendingOperationCard pendingOperation={operation} {...props} />)
    fireEvent.click(screen.getAllByRole('radio')[0]!)
    const replacement = { ...makeParentChoicePreview(1), previewFingerprint: 'replacement' }
    replacement.items![0]!.fieldOptions![0]!.options = [{ value: null, label: 'No parent' }]
    view.rerender(<PendingOperationCard pendingOperation={replacement} {...props} />)
    await act(async () => { finish({ ok: true, result: { isSuccess: true, error: null, pendingOperationId: operation.id, preview: { ...resolveParentChoicePreview(operation, '0', null), changes: [], changeTargetCount: 1 }, cancelled: false } }) })
    expect(settled).not.toHaveBeenCalled()
    expect(screen.queryByRole('radio', { name: 'Post Lunch' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(1)
    expect(screen.getByRole('button', { name: /approveCount/ })).toBeDisabled()
  })

  it('retains unresolved options after a revision failure and replaces them on a new preview', async () => {
    revise.mockResolvedValue({ ok: false, error: 'option_not_offered' })
    const operation = makeParentChoicePreview(1)
    const props = { onRevise: revise, onConfirmExecute: confirm, onPrepareStepUp: prepareStepUp, onVerifyStepUp: verifyStepUp }
    const view = render(<PendingOperationCard pendingOperation={operation} {...props} />)
    fireEvent.click(screen.getAllByRole('radio')[0]!)
    await waitFor(() => expect(screen.getByText('chat.operation.invalid')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /approveCount/ })).toBeDisabled()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    const replacement = makeParentChoicePreview(1)
    replacement.previewFingerprint = 'replacement'
    replacement.items![0]!.fieldOptions![0]!.options = [{ value: null, label: 'No parent' }]
    view.rerender(<PendingOperationCard pendingOperation={replacement} {...props} />)
    expect(screen.queryByRole('radio', { name: 'Post Lunch' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(1)
    expect(screen.getByRole('button', { name: /approveCount/ })).toBeDisabled()
  })

  it('keeps older previews unchanged and permits rejection of an unresolved batch', async () => {
    const props = { onRevise: revise, onConfirmExecute: confirm, onPrepareStepUp: prepareStepUp, onVerifyStepUp: verifyStepUp }
    const view = render(<PendingOperationCard pendingOperation={makeCreateHabitsPreview(1)} {...props} />)
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /approveCount/ })).toBeEnabled()
    view.rerender(<PendingOperationCard pendingOperation={makeParentChoicePreview(1)} {...props} />)
    revise.mockResolvedValue({ ok: true, result: { isSuccess: true, error: null, pendingOperationId: null, preview: null, cancelled: true } })
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.reject' }))
    await waitFor(() => expect(revise).toHaveBeenCalledWith(expect.any(String), { previewFingerprint: 'parent-choice-preview', items: [] }))
    expect(confirm).not.toHaveBeenCalled()
  })
})
