import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { makePendingAgentOperation } from '@orbit/shared/test-support/chat-fixtures'
import { PendingOperationCard } from '@/components/chat/pending-operation-card'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/components/ui/confirm-sheet', () => ({
  ConfirmSheet: ({ open, onConfirm }: { open: boolean; onConfirm: () => void }) =>
    open ? <button type="button" onClick={onConfirm}>confirm-sheet</button> : null,
}))
vi.mock('@/components/ui/sheet', async () => await import('../../support/sheet-double'))
vi.mock('@/components/ui/otp-input', () => ({
  OtpInput: ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) =>
    <input aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} />,
}))

const confirm = vi.fn()
const prepareStepUp = vi.fn()
const verifyStepUp = vi.fn()

describe('PendingOperationCard', () => {
  beforeEach(() => {
    confirm.mockReset()
    prepareStepUp.mockReset()
    verifyStepUp.mockReset()
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
})
