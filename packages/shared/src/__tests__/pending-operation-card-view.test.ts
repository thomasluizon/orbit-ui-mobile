import { makeCreateHabitsPreview, makeDeleteHabitsPreview, makeMixedHabitsPreview } from '../test-support/pending-operation-preview-fixtures'
import { describe, expect, it, vi } from 'vitest'
import { IntlMessageFormat } from 'intl-messageformat'
import { makeAgentOperationResult, makePendingAgentOperation, partialScheduleSummaryCases, makePartialScheduleSummaryOperation } from '../test-support/chat-fixtures'
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
import { pendingAgentOperationSchema } from '../types/ai'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'

function translateMessages(messages: typeof en, key: string, values?: Record<string, string | number>): string {
  const message = key.split('.').reduce<unknown>((current, segment) => typeof current === 'object' && current !== null ? (current as Record<string, unknown>)[segment] : undefined, messages)
  return typeof message === 'string'
    ? new IntlMessageFormat(message, messages === ptBR ? 'pt-BR' : 'en').format(values) as string
    : key
}

const translateEnglish = (key: string, values?: Record<string, string | number>) => translateMessages(en, key, values)

describe.each([{ locale: 'en', messages: en }, { locale: 'pt-BR', messages: ptBR }])('item summaries in $locale', ({ locale, messages }) => {
  const summarize = buildPendingOperationCardLabels(makePendingAgentOperation(), (key, values) => translateMessages(messages, key, values), (value) => `clock:${value}`, locale).summarize
  const change = (field: string, newValue: string | null, proposedValue?: unknown, oldValue: string | null = null) => ({ entityId: 'habit-1', entityName: 'Read', field, oldValue, newValue, valueType: 'text', proposedValue })

  it('keeps the daily cadence and requested outcomes in one summary', () => {
    expect(summarize([change('frequency_unit', 'Day'), change('frequency_quantity', '1'), change('reminder_enabled', 'True')]))
      .toBe(`${messages.habits.frequency.everyDay} · ${messages.chat.preview.summary.sendReminders}`)
  })

  it('shows an explicit disabled request even when the previous value is absent', () => {
    expect(summarize([change('enabled', 'False')])).toBe(messages.chat.preview.summary.turnOff)
    expect(summarize([change('reminder_enabled', 'false')])).toBe(messages.chat.preview.summary.stopReminders)
  })

  it('names cleared repetition when the producer formats null as an empty string', () => {
    expect(summarize([change('frequency_unit', '', null, 'Day')])).toBe(messages.habits.filter.oneTime)
  })

  it('does not invent a count for a unit-only update', () => {
    expect(summarize([change('frequency_unit', 'Month', 'Month', 'Day')])).toBe(messages.chat.preview.summary.repeatInMonths)
  })

  it('keeps mode changes visible when a unit-only update lacks the full cadence', () => {
    expect(summarize([change('frequency_unit', 'Month', 'Month', 'Day'), change('is_general', 'true')]))
      .toBe(messages.chat.preview.summary.anytime)
    expect(summarize([change('frequency_unit', 'Month', 'Month', 'Day'), change('is_flexible', 'true')]))
      .toBe(`${messages.chat.preview.summary.repeatInMonths} · ${messages.chat.preview.summary.anyDay}`)
  })

  it('localizes weekdays from the typed proposal instead of exposing the JSON display value', () => {
    expect(summarize([change('days', '["Monday", "Thursday"]', ['Monday', 'Thursday'])]))
      .toBe(`${messages.dates.daysShort.monday}, ${messages.dates.daysShort.thursday}`)
  })

  it('keeps supported user text and formats typed checklist and reminder proposals', () => {
    expect(summarize([
      change('description', 'Read a chapter'),
      change('checklist_items', 'Pack shoes and more', [{ text: 'Pack shoes', is_checked: true }, { text: 'Bring water', is_checked: false }]),
      change('scheduled_reminders', 'day_before 19:30', [{ when: 'day_before', time: '19:30' }]),
    ])).toBe(`Read a chapter · Pack shoes (${messages.blockFrame.status.done}), Bring water · ${messages.chat.preview.summary.remindDayBefore.replace('{time}', 'clock:19:30')}`)
  })

  it('describes clearing editable lists and dates', () => {
    expect(summarize([change('days', '', []), change('due_date', ''), change('due_time', ''), change('checklist_items', '', [])]))
      .toBe([messages.chat.preview.summary.clearDays, messages.chat.preview.summary.removeDate, messages.chat.preview.summary.removeTime, messages.chat.preview.summary.clearChecklist].join(' · '))
  })

  it.each([
    ['status', 'Abandoned', 'Abandoned', 'Active', 'Mark abandoned', 'Marcar abandonada'],
    ['current_value', '100', 100, '20', 'Set progress to 100', 'Definir progresso: 100'],
    ['tag_names', '["Reading","Evening"]', ['Reading', 'Evening'], 'Morning', 'Replace all tags with: Reading, Evening', 'Substituir todas as tags por: Reading, Evening'],
    ['tag_ids', '[]', [], 'Morning', 'Remove all tags', 'Remover todas as tags'],
    ['tag_ids', '["tag-1","tag-2"]', ['tag-1', 'tag-2'], 'Morning', 'Replace all tags with 2 selected tags', 'Substituir todas as tags por 2 tags selecionadas'],
  ] as const)('shows the proposed %s outcome', (field, newValue, proposedValue, oldValue, english, portuguese) => {
    expect(summarize([change(field, newValue, proposedValue, oldValue)]))
      .toBe(locale === 'en' ? english : portuguese)
  })

  it.each(partialScheduleSummaryCases)('does not assume unchanged schedule attributes: $name', (scenario) => {
    const operation = makePartialScheduleSummaryOperation(scenario)
    expect(summarize(operation.items![0]!.fields)).toBe(locale === 'en' ? scenario.english : scenario.portuguese)
  })

  it('shows changed days without inventing the retained cadence', () => {
    expect(summarize([
      change('habit_id', 'habit-1', 'habit-1'),
      change('days', '["Thursday"]', ['Thursday'], 'Monday, Wednesday'),
      change('frequency_quantity', '1', 1, '1'),
    ])).toBe(locale === 'en' ? 'Thu · Change the frequency number to 1' : 'Qui · Mudar o número da frequência para 1')
  })

  it('uses the complete supplied schedule when flexibility is explicit', () => {
    expect(summarize([
      change('habit_id', 'habit-1', 'habit-1'),
      change('frequency_unit', 'Week', 'Week', 'Week'),
      change('frequency_quantity', '3', 3, '2'),
      change('is_flexible', 'true', true, 'true'),
    ])).toBe(locale === 'en' ? '3x / Week' : '3x / Semana')
  })

  it.each([
    ['target_value', '12', 12, 'Set the target to 12', 'Definir alvo: 12'],
    ['unit', 'books', 'books', 'Measure in books', 'Medir em books'],
    ['deadline', null, null, 'Remove the deadline', 'Remover o prazo'],
    ['goal_type', 'Streak', 'Streak', 'Streak', 'Sequência'],
    ['habit_ids', '[]', [], 'Remove all habit links', 'Remover todos os vínculos com hábitos'],
    ['goal_ids', '[]', [], 'Remove all goal links', 'Remover todos os vínculos com metas'],
    ['new_parent_id', null, null, 'Move out of the parent habit', 'Mover para fora do hábito pai'],
    ['slip_alert_enabled', 'false', false, 'Stop slip alerts', 'Parar alertas de deslize'],
    ['items', '["Pack shoes"]', ['Pack shoes'], 'Pack shoes', 'Pack shoes'],
    ['action', 'mark_all_read', 'mark_all_read', 'Mark all alerts as read', 'Marcar todos os avisos como lidos'],
    ['theme_preference', null, null, 'Use the system theme', 'Usar tema do sistema'],
  ] as const)('describes supported %s writes', (field, newValue, proposedValue, english, portuguese) => {
    expect(summarize([change(field, newValue, proposedValue)])).toBe(locale === 'en' ? english : portuguese)
  })

  it.each(["deleteHabit", "updateHabits", "rescheduleHabits", "logHabits", "skipHabits", "createHabits", "deleteHabits", "deleteGoal", "deleteTag", "deleteNotification", "deleteAllNotifications", "deleteNotifications", "setCalendarSync", "dismissCalendarImport", "dismissCalendarSuggestion", "syncCalendar", "manageCalendarSync", "deleteUserFacts", "updateHabitEmojis", "createHabit", "createSubHabit", "updateHabit", "duplicateHabit", "moveHabit", "moveHabitParent", "reorderHabits", "logHabit", "skipHabit", "updateChecklist", "createGoal", "updateGoal", "updateGoalProgress", "updateGoalStatus", "reorderGoals", "linkGoalsToHabit", "linkHabitsToGoal", "createTag", "updateTag", "assignTags", "createChecklistTemplate", "deleteChecklistTemplate", "updateProfilePreferences", "setAiMemory", "setAiSummary", "markNotificationRead", "markAllNotificationsRead", "subscribePush", "unsubscribePush", "sendTestPush", "updateNotifications", "viewReferralCode", "sendSupportRequest", "createCheckout", "openBillingPortal", "manageSubscription", "viewApiKeys", "createApiKey", "revokeApiKey", "manageApiKeys", "resetAccount", "requestAccountDeletion", "confirmAccountDeletion", "manageAccount"])('names the producer action %s instead of generic pending copy', (actionKey) => {
    const operation = pendingAgentOperationSchema.parse(makePendingAgentOperation({ actionKey }))
    const labels = buildPendingOperationCardLabels(operation, (key, values) => translateMessages(messages, key, values), (time) => time, locale)
    const summary = labels.summarize([])
    expect(summary).toBe(translateMessages(messages, `chat.operation.source.${actionKey}`))
    expect(summary).not.toContain('chat.')
    expect(summary).not.toBe(messages.chat.operation.pending)
    expect(summary).not.toBe('')
  })

  it.each([
    ['interval_weeks', '2', 2, 'Every 2 weeks', 'A cada 2 semanas'],
    ['description', null, null, 'Remove the description', 'Remover a descrição'],
    ['emoji', '📚', '📚', 'Use 📚', 'Usar 📚'],
    ['emoji', null, null, 'Remove the icon', 'Remover o ícone'],
    ['end_date', null, null, 'Remove the end date', 'Remover a data final'],
    ['sub_habits', '[]', [], 'Remove the habits inside', 'Remover os hábitos dentro'],
    ['sub_habits', '[{"title":"Read"}]', [{ title: 'Read' }], '1 habit inside', '1 hábito dentro'],
    ['reminder_times', '[]', [], 'Remove the reminders', 'Remover os lembretes'],
    ['scheduled_reminders', '[]', [], 'Remove the reminders', 'Remover os lembretes'],
    ['scheduled_reminders', '[{"when":"same_day","time":"08:00"}]', [{ when: 'same_day', time: '08:00' }], 'Remind me the same day at clock:08:00', 'Lembrar no mesmo dia às clock:08:00'],
    ['checklist_items', '["Read"]', ['Read'], 'Read', 'Read'],
    ['parent_id', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'Move under the selected habit', 'Mover para dentro do hábito selecionado'],
    ['color', '#ffffff', '#ffffff', 'Tag color: #ffffff', 'Cor da tag: #ffffff'],
    ['goal_type', 'Standard', 'Standard', 'Progress', 'Progresso'],
    ['goal_ids', '["00000000-0000-4000-8000-000000000002"]', ['00000000-0000-4000-8000-000000000002'], 'Replace goal links with 1 selected goals', 'Substituir vínculos por 1 metas selecionadas'],
    ['habit_ids', '["00000000-0000-4000-8000-000000000002"]', ['00000000-0000-4000-8000-000000000002'], 'Replace habit links with 1 selected habits', 'Substituir vínculos por 1 hábitos selecionados'],
    ['positions', '[{"id":"00000000-0000-4000-8000-000000000002","position":0}]', [{ id: '00000000-0000-4000-8000-000000000002', position: 0 }], 'Reorder 1 items', 'Reordenar 1 itens'],
    ['items', '[]', [], 'Clear the checklist', 'Limpar a lista'],
    ['note', 'Read outside', 'Read outside', 'Read outside', 'Read outside'],
    ['due_end_time', '09:00', '09:00', 'Until clock:09:00', 'Até clock:09:00'],
    ['due_end_time', null, null, 'Remove the end time', 'Remover o horário final'],
    ['expires_at_utc', null, null, 'No expiry date', 'Sem data de expiração'],
    ['language', 'en', 'en', 'Use English', 'Usar Inglês'],
    ['language', 'pt-BR', 'pt-BR', 'Use Português (Brasil)', 'Usar Português (Brasil)'],
    ['week_start_day', '0', 0, 'Start the week on Sunday', 'Começar a semana no Domingo'],
    ['week_start_day', '1', 1, 'Start the week on Monday', 'Começar a semana no Segunda-feira'],
    ['theme_preference', 'dark', 'dark', 'Use the Dark theme', 'Usar tema Escuro'],
    ['theme_preference', 'light', 'light', 'Use the Light theme', 'Usar tema Claro'],
    ['interval', 'monthly', 'monthly', 'Monthly', 'Mensal'],
    ['interval', 'yearly', 'yearly', 'Yearly', 'Anual'],
    ['scopes', '["habits:read"]', ['habits:read'], 'Grant 1 selected permissions', 'Conceder 1 permissões selecionadas'],
  ] as const)('summarizes producer-shaped %s proposals', (field, newValue, proposedValue, english, portuguese) => {
    expect(summarize([change(field, newValue, proposedValue)])).toBe(locale === 'en' ? english : portuguese)
  })

  it('summarizes a complete fixed schedule from typed weekdays', () => {
    expect(summarize([
      change('frequency_unit', 'Week', 'Week', 'Day'),
      change('frequency_quantity', '1', 1, '2'),
      change('is_flexible', 'false', false, 'true'),
      change('days', '["Monday","Thursday"]', ['Monday', 'Thursday'], 'Tuesday'),
    ])).toBe(locale === 'en' ? 'Mon, Thu' : 'Seg, Qui')
  })

  it('summarizes a complete fixed schedule from bulk display weekdays', () => {
    expect(summarize([
      change('frequency_unit', 'Week', 'Week', 'Day'),
      change('frequency_quantity', '1', 1, '2'),
      change('is_flexible', 'false', false, 'true'),
      change('days', 'Monday, Thursday', undefined, 'Tuesday'),
    ])).toBe(locale === 'en' ? 'Mon, Thu' : 'Seg, Qui')
  })

  it('formats dates and reminder offsets in the visible summary', () => {
    expect(summarize([
      change('due_date', '2026-09-26', '2026-09-26'),
      change('end_date', '2026-09-27', '2026-09-27'),
      change('deadline', '2026-09-28', '2026-09-28'),
      change('reminder_times', '30 min before due', [30]),
    ])).toBe(locale === 'en'
      ? 'Sep 26, 2026 · Until Sep 27, 2026 · Due by Sep 28, 2026 · Remind me 30 min before'
      : '26 de set. de 2026 · Até 27 de set. de 2026 · Prazo até 28 de set. de 2026 · Lembrar 30 min antes')
  })

  it('keeps unknown fields and enum values out of the preview', () => {
    expect(summarize([change('frequency_unit', 'UnknownUnit'), change('internal_flag', 'InternalValue')])).toBe('')
  })
})

const labels: PendingOperationCardLabels = {
  formatTime: (value) => value,
  approve: () => 'Approve', acting: 'Working', cancel: 'Cancel', confirm: 'Delete habit',
  edit: 'Edit item', edited: 'Edited', editTitle: 'Edit', reject: 'Reject', remove: 'Remove',
  rejected: (count) => `The ${count} changes were rejected. Nothing was saved.`,
  summarize: buildPendingOperationCardLabels(makePendingAgentOperation(), translateEnglish, (value) => value).summarize, save: 'Save', search: 'Search', invalid: 'Invalid', stale: 'Stale', refresh: 'Refresh preview', refreshFailed: 'Could not refresh.', staleUnavailable: 'Unavailable', fieldLabels: {}, dayLabels: {}, yes: 'Yes', no: 'No', proposed: 'Proposed',
  addListRow: 'Add', checklistLimit: '50 items max.', scheduledLimit: '5 reminders max.', checked: 'Done', reminderWhen: 'When', reminderSameDay: 'Same day', reminderDayBefore: 'Day before', reminderTime: 'Time',
  confirmBody: 'Confirm the action', confirmNote: 'Review it', confirmTitle: () => 'Confirm',
  irreversible: 'Irreversible', name: 'Delete habit', pending: 'Pending',
  pendingTitle: 'Pending operation', open: 'Open', openNamed: (name) => `Open details: ${name}`, failed: 'Failed', denied: 'Denied', unsupported: 'Profile only',
  stepUpAction: 'Verify', stepUpMessage: 'Verification required',
  more: (count) => `and ${count} more`,
}

it('formats time values in the pending change preview', () => {
  const operation = makePendingAgentOperation({
    riskClass: 'Low', confirmationRequirement: 'None',
    changes: [{ entityId: 'habit-1', entityName: 'Run', field: 'due_time', oldValue: '08:00', newValue: '19:30', valueType: 'time' }],
    changeTargetCount: 1,
  })
  const { record, render } = createRenderers()
  renderPendingOperationCard({ card: createCard(), labels: { ...labels, summarize: buildPendingOperationCardLabels(operation, translateEnglish, (value) => `clock:${value}`).summarize }, onVerifyStepUp: vi.fn(), pendingOperation: operation, render })
  expect(JSON.stringify(record.frame?.items)).toContain('clock:19:30')
})

it('labels the pending operation from its capability without exposing risk', () => {
  const translated = buildPendingOperationCardLabels(
    makePendingAgentOperation(),
    (key) => key,
    (value) => value,
  )
  expect(translated).not.toHaveProperty('risk')
  expect(translated.name).toBe('chat.pendingOp.capability.habits-delete')
  expect(translated.confirm).toBe('chat.pendingOp.action.habits-delete')
  expect(translated.fieldLabels).toMatchObject({
    delete: 'chat.operation.field.delete',
    dismiss_import: 'chat.operation.field.dismiss_import',
    run_sync: 'chat.operation.field.run_sync',
  })
})

it('names every held write capability in both locales', () => {
  const ids = [
    'habits.write', 'goals.write', 'tags.write', 'profile.preferences.write',
    'profile.ai-memory.write', 'profile.ai-summary.write', 'notifications.write',
    'checklist-templates.write', 'referrals.write', 'support.write',
  ]
  for (const messages of [en, ptBR]) {
    for (const capabilityId of ids) {
      const key = capabilityId.replaceAll('.', '-') as keyof typeof messages.chat.pendingOp.capability
      const name = messages.chat.pendingOp.capability[key]
      expect(name, capabilityId).toBeTruthy()
      const labels = buildPendingOperationCardLabels(makePendingAgentOperation({ capabilityId }), (translationKey) =>
        translationKey.startsWith('chat.pendingOp.capability.')
          ? name
          : translationKey, (value) => value)
      expect(labels.name).toBe(name)
      expect(labels.confirm).toBe('chat.pendingOp.action.applyChanges')
      expect(labels).not.toHaveProperty('risk')
    }
  }
})

it('uses verb-first consequence labels for known confirmation capabilities in both locales', () => {
  const capabilities = ['habits.delete', 'habits.bulk.write', 'habits.bulk.delete', 'goals.delete', 'tags.delete', 'notifications.delete', 'user-facts.delete', 'calendar.sync.manage', 'subscriptions.manage', 'api-keys.manage', 'sync.write', 'account.manage']
  for (const messages of [en, ptBR]) {
    for (const capabilityId of capabilities) {
      const actionKey = capabilityId.replaceAll('.', '-') as keyof typeof messages.chat.pendingOp.action
      const label = messages.chat.pendingOp.action[actionKey]
      expect(label.split(' '), capabilityId).toHaveLength(2)
      expect(label.split(' ')[0], capabilityId).toMatch(/^(Delete|Change|Sync|Apagar|Alterar|Sincronizar)$/)
      expect(buildPendingOperationCardLabels(makePendingAgentOperation({ capabilityId }), (key) => key, (value) => value).confirm)
        .toBe(`chat.pendingOp.action.${actionKey}`)
    }
  }
})

it('names deletion of saved AI memory on the confirmation in both locales', () => {
  for (const [messages, expected] of [[en, 'Delete memory'], [ptBR, 'Apagar memória']] as const) {
    const pendingOperation = makePendingAgentOperation({ capabilityId: 'user-facts.delete' })
    const translate = (key: string) => key.startsWith('chat.pendingOp.action.')
      ? (messages.chat.pendingOp.action as Record<string, string>)[key.slice('chat.pendingOp.action.'.length)] ?? key
      : key
    const localized = buildPendingOperationCardLabels(pendingOperation, translate, (value) => value)
    const { record, render } = createRenderers()
    renderPendingOperationCard({
      card: createCard(), labels: localized, render, onVerifyStepUp: vi.fn(), pendingOperation,
    })
    expect(record.confirm?.confirmLabel).toBe(expected)
  }
})

it('keeps generic confirmation copy for an unknown capability', () => {
  const localized = buildPendingOperationCardLabels(
    makePendingAgentOperation({ capabilityId: 'unknown.capability' }),
    (key) => key,
    (value) => value,
  )
  expect(localized.confirm).toBe('chat.pendingOp.action.applyChanges')
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
    stepUp: (props) => { record.stepUp = props; return 'step-up' },
    verification: (props) => { record.verification = props; return 'verification' },
    editSheet: () => 'edit-sheet',
    removeItem: (label, _disabled, onClick) => { record.buttons.push({ label, onClick }); return label },
    notice: (message) => message,
    actionRow: (...children) => children.join('|'),
    fragment: (...children) => children.filter(Boolean).join('|'),
    spacer: () => 'spacer',
    rejected: (message) => message,
  }
  return { record, render }
}

describe('pending operation card view', () => {
  it('keeps the complete capability title visible in a narrow preview', () => {
    const { record, render } = createRenderers()
    renderPendingOperationCard({
      card: createCard(), labels, render, onVerifyStepUp: vi.fn(),
      pendingOperation: makePendingAgentOperation({ capabilityId: 'profile.preferences.write' }),
    })
    expect(record.frame?.wrapTitle).toBe(true)
  })

  it('names each completed row in its open control', () => {
    const { record, render } = createRenderers()
    renderPendingOperationCard({
      card: { ...createCard(), status: 'done', completedOperation: makeAgentOperationResult('Succeeded', 1), onOpenTarget: vi.fn() },
      labels, render, onVerifyStepUp: vi.fn(),
      pendingOperation: makePendingAgentOperation({
        capabilityId: 'habits.bulk.write', previewFingerprint: 'preview',
        changeTargetCount: 2,
        changes: [
          { entityId: 'habit-water', entityName: 'Water', field: 'title', oldValue: 'Water', newValue: 'Water', valueType: 'string' },
          { entityId: 'habit-walk', entityName: 'Walk', field: 'title', oldValue: 'Walk', newValue: 'Walk', valueType: 'string' },
        ],
      }),
    })
    expect(record.buttons.filter((button) => button.label === 'Open').map((button) => button.accessibleName))
      .toEqual(['Open details: Water', 'Open details: Walk'])
  })

  it('names the affected resource on the irreversible confirmation', () => {
    const { record, render } = createRenderers()
    renderPendingOperationCard({
      card: createCard(), labels, render, onVerifyStepUp: vi.fn(),
      pendingOperation: makePendingAgentOperation(),
    })
    expect(record.confirm?.confirmLabel).toBe('Delete habit')
  })
  it('shows an action target without inventing a value transition', () => {
    const { record, render } = createRenderers()
    renderPendingOperationCard({
      card: createCard(), labels: { ...labels, fieldLabels: {
        delete: 'Delete', dismiss_import: 'Dismiss import', run_sync: 'Sync now',
      } }, render,
      onVerifyStepUp: vi.fn(),
      pendingOperation: makePendingAgentOperation({
        changes: [
          { entityId: 'habit-1', entityName: 'Run', field: 'delete', oldValue: null, newValue: null, valueType: 'action' },
          { entityId: 'calendar-1', entityName: 'Calendar sync', field: 'dismiss_import', oldValue: 'True', newValue: null, valueType: 'action' },
          { entityId: 'calendar-2', entityName: 'Calendar sync', field: 'run_sync', oldValue: '2026-09-26T10:00:00Z', newValue: null, valueType: 'action' },
        ],
        changeTargetCount: 3,
      }),
    })
    expect(record.frame?.items.map(({ label, meta }) => ({ label, meta }))).toEqual([
      { label: 'Run', meta: 'Delete' },
      { label: 'Calendar sync', meta: 'Dismiss import' },
      { label: 'Calendar sync', meta: 'Sync now' },
    ])
  })

  it('keeps boolean field identifiers out of bulk and calendar previews', () => {
    const { record, render } = createRenderers()
    renderPendingOperationCard({
      card: createCard(), labels, render, onVerifyStepUp: vi.fn(),
      pendingOperation: makePendingAgentOperation({
        riskClass: 'Low', confirmationRequirement: 'None',
        changes: [
          { entityId: 'habit-1', entityName: 'Run', field: 'reminder_enabled', oldValue: 'false', newValue: 'true', valueType: 'boolean' },
          { entityId: 'calendar', entityName: 'Calendar sync', field: 'enabled', oldValue: 'True', newValue: 'False', valueType: 'boolean' },
        ],
        changeTargetCount: 2,
      }),
    })
    expect(record.frame?.items.map((item) => item.label)).toEqual([
      'Run',
      'Calendar sync',
    ])
    expect(record.frame?.items.map((item) => item.meta)).toEqual(['Send reminders', 'Turn off'])
  })

  it('keeps unknown boolean changes out of the visible item label', () => {
    const { record, render } = createRenderers()
    renderPendingOperationCard({
      card: createCard(), labels,
      render, onVerifyStepUp: vi.fn(),
      pendingOperation: makePendingAgentOperation({
        changes: [{ entityId: 'calendar', entityName: 'Calendar sync', field: 'enabled', oldValue: 'False', newValue: 'True', valueType: 'boolean' }],
        changeTargetCount: 1,
      }),
    })
    expect(record.frame?.items[0]?.label).toBe('Calendar sync')
  })

  it('keeps the eleventh target removable when only ten changes are displayed', () => {
    const card = createCard()
    const { record, render } = createRenderers()
    const items = Array.from({ length: 11 }, (_, index) => {
      const entityId = `habit-${index + 1}`
      const entityName = `Habit ${index + 1}`
      const field = { entityId, entityName, field: 'delete', oldValue: null, newValue: null, valueType: 'action' }
      return { itemId: entityId, entityId, entityName, fields: [field], stateFingerprint: `state-${index + 1}` }
    })
    const operation = makePendingAgentOperation({
      previewFingerprint: 'preview-1', items,
      changes: items.slice(0, 10).flatMap((item) => item.fields),
      changeTargetCount: 11,
    })
    card.revision = {
      operation, canRevise: true, items, editingItem: undefined,
      draft: {}, editedItemIds: [], busy: false, stale: false, canRefresh: true, refresh: vi.fn(), rejected: false, error: undefined,
      setDraftField: vi.fn(), closeEdit: vi.fn(), startEdit: vi.fn(),
      saveEdit: vi.fn().mockResolvedValue(undefined),
      rejectItem: vi.fn().mockResolvedValue(undefined),
      rejectAll: vi.fn().mockResolvedValue(undefined),
    }
    renderPendingOperationCard({ card, labels: { ...labels, fieldLabels: { delete: 'Delete' } }, onVerifyStepUp: vi.fn(), pendingOperation: operation, render })
    expect(record.frame?.items).toHaveLength(11)
    expect(record.frame?.items.at(-1)).toMatchObject({ label: 'Habit 11', meta: 'Delete', control: 'Remove Habit 11' })
    record.buttons.find(({ label }) => label === 'Remove Habit 11')?.onClick()
    expect(card.revision.rejectItem).toHaveBeenCalledWith('habit-11')
  })

  it('shows named items and the count of unseen targets', () => {
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
      'Run',
      'Read',
      'and 38 more',
    ])
    expect(record.frame?.items.slice(0, 2).every((item) => item.proposed === true)).toBe(true)
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
    expect(record.frame?.items[0]).toMatchObject({ proposed: true, wrapLabel: true, wrapMeta: true, meta: 'Sep 26, 2026 · Send reminders' })
    expect(record.frame?.actions).toBe('Approve|Edit item|spacer|Reject')
    expect(record.buttons.map(({ label }) => label)).toContain('Reject')
    record.buttons.find(({ label }) => label === 'Remove Run')?.onClick()
    expect(card.revision.rejectItem).toHaveBeenCalledWith('habit-1')
  })

  it('confirms destructive actions and builds the frame from plain state', () => {
    const card = createCard()
    const { record, render } = createRenderers()
    const output = renderPendingOperationCard({
      card, labels, onVerifyStepUp: vi.fn(), pendingOperation: makeDeleteHabitsPreview(1), render,
    })

    expect(output).toBe('frame|confirm')
    expect(record.frame).toMatchObject({
      state: 'resting', items: [{ irreversible: true, status: undefined }],
      actions: 'Approve|spacer|Reject',
    })
    expect(record.buttons.map(({ label }) => label)).toEqual(['Reject', 'Approve'])
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
    })).toBe('The 1 changes were rejected. Nothing was saved.')
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


describe.each([{ locale: 'en', messages: en }, { locale: 'pt-BR', messages: ptBR }])('operation treatment in $locale', ({ locale, messages }) => {
  it.each(['createHabits', 'logHabits', 'skipHabits', 'updateHabits', 'rescheduleHabits'])('approves %s without deletion treatment regardless of risk', (actionKey) => {
    for (const riskClass of ['Low', 'Destructive', 'High'] as const) {
      const operation = { ...makeCreateHabitsPreview(), actionKey, riskClass }
      const localized = buildPendingOperationCardLabels(operation, (key, values) => translateMessages(messages, key, values), (time) => time, locale)
      const card = createCard()
      const { record, render } = createRenderers()
      renderPendingOperationCard({ card, labels: localized, render, onVerifyStepUp: vi.fn(), pendingOperation: operation })
      expect(record.frame?.items.every((item) => !item.irreversible)).toBe(true)
      expect(record.confirm).toMatchObject({ open: false, destructive: false })
      const approve = record.buttons.find((button) => button.label === localized.approve(12))!
      expect(approve.label).not.toBe(messages.chat.operation.approve)
      expect(approve.label).not.toContain('chat.')
      approve.onClick()
      expect(card.execute).toHaveBeenCalledOnce()
      expect(card.setConfirmOpen).not.toHaveBeenCalled()
    }
  })

  it('marks the exact producer delete items and counts all of them beyond ten displayed changes', () => {
    for (const operation of [makeMixedHabitsPreview(), makeDeleteHabitsPreview(12)]) {
      const localized = buildPendingOperationCardLabels(operation, (key, values) => translateMessages(messages, key, values), (time) => time, locale)
      const { record, render } = createRenderers()
      const card = createCard()
      renderPendingOperationCard({ card, labels: localized, render, onVerifyStepUp: vi.fn(), pendingOperation: operation })
      expect(record.frame?.items.map((item) => item.irreversible)).toEqual(operation.items!.map((item) => item.removesData === true))
      const deletionCount = operation.items!.filter((item) => item.removesData).length
      expect(record.confirm).toMatchObject({ title: locale === 'en' ? `Delete ${deletionCount} habits?` : `Apagar ${deletionCount} hábitos?`,
        confirmLabel: locale === 'en' ? 'Delete habits' : 'Apagar hábitos', destructive: true })
      record.buttons.find((button) => button.label === localized.approve(operation.changeTargetCount!))!.onClick()
      expect(card.execute).not.toHaveBeenCalled()
      expect(card.setConfirmOpen).toHaveBeenCalledWith(true)
    }
  })

  it('does not guess removal from missing or null metadata or an unknown action', () => {
    const original = makeCreateHabitsPreview(2)
    const operation = pendingAgentOperationSchema.parse({ ...original, riskClass: 'Destructive', actionKey: 'unknownAction',
      items: original.items!.map((item, index) => ({ ...item, removesData: index === 0 ? null : undefined })) })
    const localized = buildPendingOperationCardLabels(operation, (key, values) => translateMessages(messages, key, values), (time) => time, locale)
    const card = createCard()
    const { record, render } = createRenderers()
    renderPendingOperationCard({ card, labels: localized, render, onVerifyStepUp: vi.fn(), pendingOperation: operation })
    expect(record.frame?.items.map((item) => item.irreversible)).toEqual([false, false])
    expect(record.confirm).toMatchObject({ open: false, destructive: false })
    expect(localized.approve(2)).toBe(messages.chat.operation.approve)
  })
})
