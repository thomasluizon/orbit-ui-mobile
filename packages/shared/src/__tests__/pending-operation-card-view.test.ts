import { describe, expect, it, vi } from 'vitest'
import { makePendingAgentOperation } from '../test-support/chat-fixtures'
import {
  renderPendingOperationCard,
  type PendingOperationCardActions,
  type PendingOperationCardRenderers,
  type PendingOperationButtonSpec,
  type PendingOperationConfirmSheetProps,
  type PendingOperationFrame,
  type PendingOperationVerificationProps,
} from '../chat/pending-operation-card-view'
import { buildPendingOperationCardLabels, type PendingOperationCardLabels } from '../chat/pending-operation-card'

const labels: PendingOperationCardLabels = {
  approve: 'Approve', acting: 'Working', cancel: 'Cancel', confirm: 'Confirm',
  edit: 'Edit item', edited: 'Edited', editTitle: 'Edit', reject: 'Reject', remove: 'Remove',
  rejected: 'Declined:', save: 'Save', search: 'Search', invalid: 'Invalid', stale: 'Stale', refresh: 'Refresh preview', refreshFailed: 'Could not refresh.', staleUnavailable: 'Unavailable', fieldLabels: {}, dayLabels: {}, yes: 'Yes', no: 'No', proposed: 'Proposed',
  addListRow: 'Add', checklistLimit: '50 items max.', scheduledLimit: '5 reminders max.', checked: 'Done', reminderWhen: 'When', reminderSameDay: 'Same day', reminderDayBefore: 'Day before', reminderTime: 'Time',
  confirmBody: 'Confirm the action', confirmNote: 'Review it', confirmTitle: 'Confirm',
  irreversible: 'Irreversible', name: 'Delete habit', pending: 'Pending',
  pendingTitle: 'Pending operation', risk: 'Destructive',
  stepUpAction: 'Verify', stepUpMessage: 'Verification required',
  notSet: 'Not set', diff: (field, oldValue, newValue) => `${field}: from ${oldValue} to ${newValue}`,
  more: (count) => `and ${count} more`,
}

it('labels the pending operation from its capability and risk', () => {
  const translated = buildPendingOperationCardLabels(
    makePendingAgentOperation(),
    (key) => key,
  )
  expect(translated.risk).toBe('chat.operation.risk.destructive')
  expect(translated.name).toBe('chat.pendingOp.capability.habits-delete')
})

function createCard(): PendingOperationCardActions {
  return {
    busy: false, confirmOpen: false, dismissed: false, preparedStepUp: undefined, closingStepUp: undefined,
    status: undefined, completeStepUp: vi.fn(), closeStepUp: vi.fn(), clearClosingStepUp: vi.fn(), dismiss: vi.fn(),
    execute: vi.fn().mockResolvedValue(undefined), setConfirmOpen: vi.fn(),
    startStepUp: vi.fn().mockResolvedValue(undefined),
  }
}

function createRenderers() {
  const record: {
    frame?: PendingOperationFrame<string>
    buttons: PendingOperationButtonSpec[]
    confirm?: PendingOperationConfirmSheetProps
    verification?: PendingOperationVerificationProps
    stepUp?: { onAction: () => void }
  } = { buttons: [] }
  const render: PendingOperationCardRenderers<string> = {
    blockFrame: (props) => { record.frame = props; return 'frame' },
    button: (spec) => { record.buttons.push(spec); return spec.label },
    confirmSheet: (props) => { record.confirm = props; return 'confirm' },
    risk: (label) => label,
    stepUp: (props) => { record.stepUp = props; return 'step-up' },
    verification: (props) => { record.verification = props; return 'verification' },
    editSheet: () => 'edit-sheet',
    removeItem: (label, _disabled, onClick) => { record.buttons.push({ label, onClick }); return label },
    notice: (message) => message,
    actionRow: (...children) => children.join('|'),
    fragment: (...children) => children.filter(Boolean).join('|'),
    diffLabel: (_field, _oldValue, _newValue, accessible) => accessible,
  }
  return { record, render }
}

describe('pending operation card view', () => {
  it('shows each changed field and the count of unseen targets', () => {
    const { record, render } = createRenderers()
    renderPendingOperationCard({
      card: createCard(), labels, render, onVerifyStepUp: vi.fn(),
      pendingOperation: makePendingAgentOperation({
        riskClass: 'Low', confirmationRequirement: 'None',
        changes: [
          { entityId: 'one', entityName: 'Run', field: 'date', oldValue: null, newValue: 'Monday', valueType: 'date' },
          { entityId: 'two', entityName: 'Read', field: 'count', oldValue: '2', newValue: '3', valueType: 'number' },
        ],
        changeTargetCount: 40,
      }),
    })
    expect(record.frame?.items.map((item) => item.label)).toEqual([
      'date: from Not set to Monday',
      'count: from 2 to 3',
      'and 38 more',
    ])
    expect(record.frame?.items.every((item) => item.proposed !== true)).toBe(true)
  })

  it('counts truncated entities rather than changed fields', () => {
    const { record, render } = createRenderers()
    renderPendingOperationCard({
      card: createCard(), labels, render, onVerifyStepUp: vi.fn(),
      pendingOperation: makePendingAgentOperation({
        riskClass: 'Low', confirmationRequirement: 'None', changeTargetCount: 40,
        changes: Array.from({ length: 10 }, (_, index) => ({
          entityId: `habit-${index}`, entityName: `Habit ${index}`,
          field: 'count', oldValue: '1', newValue: '2', valueType: 'number',
        })),
      }),
    })
    expect(record.frame?.items).toHaveLength(11)
    expect(record.frame?.items.at(-1)?.label).toBe('and 30 more')
  })

  it('offers item editing and rejection before approving a preview', () => {
    const card = createCard()
    const { record, render } = createRenderers()
    const operation = makePendingAgentOperation({
      previewFingerprint: 'preview-1',
      items: [
        { itemId: 'habit-1', entityId: 'habit-1', entityName: 'Run', stateFingerprint: 'state-1', fields: [
          { entityId: 'habit-1', entityName: 'Run', field: 'date', oldValue: null, newValue: '2026-09-26', valueType: 'date' },
          { entityId: 'habit-1', entityName: 'Run', field: 'reminder_enabled', oldValue: 'false', newValue: 'true', valueType: 'boolean' },
        ] },
        { itemId: 'habit-2', entityId: 'habit-2', entityName: 'Read', stateFingerprint: 'state-2', fields: [
          { entityId: 'habit-2', entityName: 'Read', field: 'date', oldValue: null, newValue: '2026-09-26', valueType: 'date' },
        ] },
      ],
    })
    card.revision = {
      operation, canRevise: true, items: operation.items ?? [], editingItem: undefined,
      draft: {}, editedItemIds: [], busy: false, stale: false, canRefresh: true, refresh: vi.fn(), rejected: false, error: undefined,
      setDraftField: vi.fn(), closeEdit: vi.fn(), startEdit: vi.fn(),
      saveEdit: vi.fn().mockResolvedValue(undefined),
      rejectItem: vi.fn().mockResolvedValue(undefined),
      rejectAll: vi.fn().mockResolvedValue(undefined),
    }
    renderPendingOperationCard({ card, labels, onVerifyStepUp: vi.fn(), pendingOperation: operation, render })
    expect(record.frame?.items.map((item) => item.id)).toEqual(['habit-1', 'habit-2'])
    expect(record.frame?.count).toBe(operation.changeTargetCount)
    expect(record.frame?.items.every((item) => item.label !== '')).toBe(true)
    expect(record.frame?.items[0]).toMatchObject({ proposed: true, wrapLabel: true, wrapMeta: true, meta: 'date: 2026-09-26 · reminder_enabled: Yes' })
    expect(record.frame?.actions).toBe('Approve|Edit item|Reject')
    expect(record.buttons.map(({ label }) => label)).toContain('Reject')
    record.buttons.find(({ label }) => label === 'Remove Run')?.onClick()
    expect(card.revision.rejectItem).toHaveBeenCalledWith('habit-1')
  })

  it('confirms destructive actions and builds the frame from plain state', () => {
    const card = createCard()
    const { record, render } = createRenderers()
    const output = renderPendingOperationCard({
      card, labels, onVerifyStepUp: vi.fn(), pendingOperation: makePendingAgentOperation(), render,
    })

    expect(output).toBe('frame|confirm')
    expect(record.frame).toMatchObject({
      state: 'resting', items: [{ irreversible: true, status: undefined }],
      actions: 'Cancel|Approve',
    })
    expect(record.buttons.map(({ label }) => label)).toEqual(['Cancel', 'Approve'])
    record.buttons[1]?.onClick()
    expect(card.setConfirmOpen).toHaveBeenCalledWith(true)
    record.confirm?.onConfirm()
    expect(card.setConfirmOpen).toHaveBeenCalledWith(false)
    expect(card.execute).toHaveBeenCalledOnce()
  })

  it('hands step up to the verifier and hides dismissed cards', () => {
    const card = createCard()
    card.preparedStepUp = { challengeId: 'challenge-1', confirmationToken: 'token-1' }
    const { record, render } = createRenderers()
    const operation = makePendingAgentOperation({ confirmationRequirement: 'StepUp' })
    const onVerifyStepUp = vi.fn()
    expect(renderPendingOperationCard({ card, labels, onVerifyStepUp, pendingOperation: operation, render }))
      .toBe('frame|confirm|verification')
    expect(record.stepUp).toBeDefined()
    record.stepUp?.onAction()
    expect(card.startStepUp).toHaveBeenCalledOnce()
    expect(record.verification).toMatchObject({
      prepared: card.preparedStepUp, onVerify: onVerifyStepUp,
    })
    expect(renderPendingOperationCard({
      card: { ...card, dismissed: true }, labels, onVerifyStepUp, pendingOperation: operation, render,
    })).toBeNull()
  })

  it('uses neutral actions for reversible operations and no actions after failure', () => {
    const card = createCard()
    const { record, render } = createRenderers()
    const operation = makePendingAgentOperation({ riskClass: 'High', confirmationRequirement: 'None' })
    renderPendingOperationCard({ card, labels, onVerifyStepUp: vi.fn(), pendingOperation: operation, render })
    expect(record.buttons[1]?.variant).toBe('primary')
    record.buttons[1]?.onClick()
    expect(card.execute).toHaveBeenCalledOnce()

    const failed = createRenderers()
    renderPendingOperationCard({
      card: { ...card, status: 'failed' }, labels, onVerifyStepUp: vi.fn(),
      pendingOperation: operation, render: failed.render,
    })
    expect(failed.record.frame).toMatchObject({ state: 'partiallyFailed', actions: undefined })
  })
})
