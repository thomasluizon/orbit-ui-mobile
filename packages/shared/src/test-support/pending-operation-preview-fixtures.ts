import { agentExecuteOperationResponseSchema, pendingAgentOperationSchema, type AgentExecuteOperationResponse, type PendingAgentOperation } from '../types/ai'

const emptyId = '00000000-0000-0000-0000-000000000000'

export function makeRestartPlanPreview(): PendingAgentOperation {
  const operation = makeExistingHabitPreview('📖', 'rescheduleHabits')
  const dates = [
    ['Read', '2026-10-28', '2026-10-28'],
    ['Stretch', '2026-10-28', '2026-10-28'],
    ['Walk', '2026-10-26', '2026-10-28'],
    ['Practice', '2026-10-27', '2026-10-29'],
    ['Tidy', '2026-10-28', '2026-11-04'],
  ] as const
  const items = dates.map(([entityName, oldValue, newValue], index) => {
    const entityId = `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`
    return { ...operation.items![0]!, itemId: entityId, entityId, entityName,
      stateFingerprint: `restart-state-${index}`,
      fields: [{ ...operation.items![0]!.fields[0]!, entityId, entityName, oldValue, newValue, proposedValue: newValue }],
    }
  })
  return pendingAgentOperationSchema.parse({ ...operation, capabilityId: 'habits.bulk.write',
    displayName: 'bulk_reschedule_habits', changeTargetCount: items.length, items,
    changes: items.flatMap(item => item.fields.filter(field => field.oldValue !== field.newValue)),
    previewFingerprint: 'restart-preview',
  })
}

export function makeTypedHabitsPreview(types: readonly (string | null | undefined)[] = ['General', 'Habit', 'Task', 'Habit', 'Task']): PendingAgentOperation {
  const operation = makeCreateHabitsPreview(types.length)
  return pendingAgentOperationSchema.parse({ ...operation, items: operation.items!.map((item, index) => ({ ...item, habitType: types[index] })) })
}

export function makeExistingHabitPreview(entityEmoji?: string | null, actionKey = 'updateHabit', changesOnly = false): PendingAgentOperation {
  const entityId = '00000000-0000-4000-8000-000000000006'
  const entityName = 'Dentista'
  const fields = [{ entityId, entityName, entityEmoji, field: 'due_date', oldValue: '2026-10-28',
    newValue: '2026-11-04', proposedValue: '2026-11-04', valueType: 'date', isEditable: true }]
  return pendingAgentOperationSchema.parse({
    ...makeCreateHabitsPreview(1), capabilityId: 'habits.write', actionKey,
    changes: fields, changeTargetCount: 1,
    items: changesOnly ? null : [{ itemId: entityId, entityId, entityName, entityEmoji,
      stateFingerprint: 'existing-habit-state', removesData: actionKey === 'deleteHabit', fields }],
  })
}

export function makeBulkCreateExecutionResponse(statuses?: readonly ('Success' | 'Failed')[]): AgentExecuteOperationResponse {
  const successCount = statuses?.filter((status) => status === 'Success').length ?? 0
  return agentExecuteOperationResponseSchema.parse({
    operation: {
      operationId: 'bulk_create_habits', sourceName: 'bulk_create_habits', riskClass: 'Low',
      confirmationRequirement: 'FreshConfirmation', status: statuses ? 'Succeeded' : 'Failed',
      summary: 'Create habits', targetId: null,
      targetName: statuses ? `${successCount}/${statuses.length} habits created` : null,
      policyReason: statuses ? null : 'unexpected_error', pendingOperationId: null,
      payload: statuses ? { results: statuses.map((status, index) => ({
        index, status, habitId: status === 'Success' ? `00000000-0000-4000-8000-${String(index + 20).padStart(12, '0')}` : null,
        title: `Habit ${index + 1}`, error: status === 'Failed' ? 'Title cannot be empty.' : null,
        field: status === 'Failed' ? 'title' : null,
      })) } : null,
    },
    pendingOperation: null, policyDenial: null,
  })
}

export function makeCreateHabitsPreview(count = 12): PendingAgentOperation {
  return pendingAgentOperationSchema.parse({
    id: '00000000-0000-4000-8000-000000000001', capabilityId: 'habits.bulk.write',
    displayName: 'Bulk habit changes', summary: 'Create habits', riskClass: 'Low',
    confirmationRequirement: 'FreshConfirmation', expiresAtUtc: '2026-10-01T12:00:00Z',
    actionKey: 'createHabits', changes: [], changeTargetCount: count, previewFingerprint: 'create-preview',
    items: Array.from({ length: count }, (_, index) => ({
      itemId: String(index), entityId: null, entityName: `Habit ${index + 1}`,
      stateFingerprint: `create-state-${index}`, removesData: false,
      fields: [{ entityId: emptyId, entityName: `Habit ${index + 1}`, field: 'title',
        oldValue: null, newValue: `Habit ${index + 1}`, valueType: 'text',
        proposedValue: `Habit ${index + 1}`, isEditable: true }],
    })),
  })
}

export function makeSuggestionBatchPreview(update: 'none' | 'habit_id' | 'oldValue' = 'none'): PendingAgentOperation {
  const operation = makeCreateHabitsPreview(2)
  return pendingAgentOperationSchema.parse({ ...operation, actionKey: 'applyAccountChanges', capabilityId: 'chat.changes',
    items: operation.items!.map((item, index) => {
      const fields = [
        ...item.fields,
        ...[
          { field: 'frequency_unit', newValue: 'Day', proposedValue: 'Day', valueType: 'text' },
          { field: 'frequency_quantity', newValue: '1', proposedValue: 1, valueType: 'number' },
          { field: 'interval_weeks', newValue: '1', proposedValue: 1, valueType: 'number' },
          { field: 'due_date', newValue: '2026-10-27', proposedValue: '2026-10-27', valueType: 'date' },
          { field: 'due_time', newValue: '08:15', proposedValue: '08:15', valueType: 'time' },
          { field: 'checklist_items', newValue: '[]', proposedValue: [], valueType: 'text' },
          { field: 'due_end_time', newValue: '08:30', proposedValue: '08:30', valueType: 'time' },
          { field: 'reminder_enabled', newValue: 'False', proposedValue: false, valueType: 'boolean' },
          { field: 'reminder_times', newValue: '[]', proposedValue: [], valueType: 'text' },
          { field: 'parent_habit_id', newValue: 'No parent (top level)', proposedValue: null, valueType: 'text' },
        ].map((field) => ({ entityId: emptyId, entityName: item.entityName, oldValue: null, isEditable: true, ...field })),
      ]
      if (index === 1 && update === 'habit_id') fields.push({ ...item.fields[0]!, field: 'habit_id', newValue: '00000000-0000-4000-8000-000000000002' })
      return { ...item, fields: index === 1 && update === 'oldValue'
        ? fields.map((field) => field.field === 'reminder_enabled' ? { ...field, oldValue: 'True' } : field) : fields }
    }),
  })
}

export function makeDeleteHabitsPreview(count = 3): PendingAgentOperation {
  const items = Array.from({ length: count }, (_, index) => {
    const entityId = `00000000-0000-4000-8000-${String(index + 2).padStart(12, '0')}`
    const entityName = `Old habit ${index + 1}`
    return { itemId: entityId, entityId, entityName, stateFingerprint: `delete-state-${index}`,
      removesData: true, fields: [{ entityId, entityName, field: 'delete', oldValue: null,
        newValue: null, valueType: 'action', proposedValue: null, isEditable: false }] }
  })
  return pendingAgentOperationSchema.parse({
    id: '00000000-0000-4000-8000-000000000005', capabilityId: 'habits.bulk.delete',
    displayName: 'Delete habits', summary: 'Delete habits', riskClass: 'Destructive',
    confirmationRequirement: 'FreshConfirmation', expiresAtUtc: '2026-10-01T12:00:00Z',
    actionKey: 'deleteHabits', changes: items.slice(0, 10).flatMap((item) => item.fields),
    changeTargetCount: count, previewFingerprint: 'delete-preview', items,
  })
}

export function makeMixedHabitsPreview(): PendingAgentOperation {
  const create = makeCreateHabitsPreview(2)
  const deletion = makeDeleteHabitsPreview()
  return { ...create, riskClass: 'Destructive', previewFingerprint: 'mixed-preview',
    items: [...create.items!, ...deletion.items!], changeTargetCount: 5 }
}

export function makeParentChoicePreview(count = 2): PendingAgentOperation {
  const operation = makeCreateHabitsPreview(count)
  return pendingAgentOperationSchema.parse({ ...operation, previewFingerprint: 'parent-choice-preview', items: operation.items!.map((item) => ({
    ...item,
    fields: [...item.fields, { entityId: emptyId, entityName: item.entityName,
      field: 'parent_habit_id', oldValue: null, newValue: 'Post Lunch',
      proposedValue: 'Post Lunch', valueType: 'text', isEditable: true }],
    validationErrors: [{ field: 'parent_habit_id', errorCode: 'parent_choice_required', error: 'Choose a parent habit or No parent.' }],
    fieldOptions: [{ field: 'parent_habit_id', required: true, options: [
      { value: '11111111-1111-1111-1111-111111111111', label: 'Post Lunch' },
      { value: '22222222-2222-2222-2222-222222222222', label: 'Post Lunch' },
      { value: null, label: 'No parent' },
    ] }],
  })) })
}

export function resolveParentChoicePreview(operation: PendingAgentOperation, itemId: string, value: string | null): PendingAgentOperation {
  return pendingAgentOperationSchema.parse({ ...operation,
    previewFingerprint: `${operation.previewFingerprint}-${itemId}`,
    items: operation.items!.map((item) => item.itemId !== itemId ? item : {
      ...item, fieldOptions: undefined,
      fields: item.fields.map((field) => field.field !== 'parent_habit_id' ? field : {
        ...field, proposedValue: value, newValue: value === null ? 'No parent' : 'Post Lunch',
      }),
    }),
  })
}

const eveningRoutinePreview = {
  "id": "00000000-0000-4000-8000-000000000001",
  "capabilityId": "habits.bulk.write",
  "displayName": "Bulk Habit Updates",
  "summary": "Bulk Create Habits requested via Chat",
  "riskClass": "Low",
  "confirmationRequirement": "FreshConfirmation",
  "expiresAtUtc": "2026-10-01T12:00:00Z",
  "changes": [],
  "changeTargetCount": 1,
  "items": [
    {
      "itemId": "0",
      "entityId": null,
      "entityName": "Evening routine",
      "fields": [
        {
          "entityId": "00000000-0000-0000-0000-000000000000",
          "entityName": "Evening routine",
          "field": "title",
          "oldValue": null,
          "newValue": "Evening routine",
          "valueType": "text",
          "proposedValue": "Evening routine",
          "isEditable": true
        },
        {
          "entityId": "00000000-0000-0000-0000-000000000000",
          "entityName": "Evening routine",
          "field": "due_time",
          "oldValue": null,
          "newValue": "21:30",
          "valueType": "time",
          "proposedValue": "21:30",
          "isEditable": true
        },
        {
          "entityId": "00000000-0000-0000-0000-000000000000",
          "entityName": "Evening routine",
          "field": "emoji",
          "oldValue": null,
          "newValue": "🌙",
          "valueType": "emoji",
          "proposedValue": "🌙",
          "isEditable": true
        },
        {
          "entityId": "00000000-0000-0000-0000-000000000000",
          "entityName": "Evening routine",
          "field": "frequency_quantity",
          "oldValue": null,
          "newValue": "1",
          "valueType": "number",
          "proposedValue": 1,
          "isEditable": true
        },
        {
          "entityId": "00000000-0000-0000-0000-000000000000",
          "entityName": "Evening routine",
          "field": "frequency_unit",
          "oldValue": null,
          "newValue": "Day",
          "valueType": "text",
          "proposedValue": "Day",
          "isEditable": true
        },
        {
          "entityId": "00000000-0000-0000-0000-000000000000",
          "entityName": "Evening routine",
          "field": "is_bad_habit",
          "oldValue": null,
          "newValue": "False",
          "valueType": "boolean",
          "proposedValue": false,
          "isEditable": true
        },
        {
          "entityId": "00000000-0000-0000-0000-000000000000",
          "entityName": "Evening routine",
          "field": "is_flexible",
          "oldValue": null,
          "newValue": "False",
          "valueType": "boolean",
          "proposedValue": false,
          "isEditable": true
        },
        {
          "entityId": "00000000-0000-0000-0000-000000000000",
          "entityName": "Evening routine",
          "field": "is_general",
          "oldValue": null,
          "newValue": "False",
          "valueType": "boolean",
          "proposedValue": false,
          "isEditable": true
        },
        {
          "entityId": "00000000-0000-0000-0000-000000000000",
          "entityName": "Evening routine",
          "field": "sub_habits",
          "oldValue": null,
          "newValue": "[{\"due_time\":\"21:30\",\"emoji\":\"\\uD83D\\uDCD6\",\"frequency_quantity\":1,\"frequency_unit\":\"Day\",\"is_bad_habit\":false,\"is_flexible\":false,\"is_general\":false,\"title\":\"Read for 20 minutes\"},{\"due_time\":\"21:30\",\"emoji\":\"\\uD83E\\uDDD8\",\"frequency_quantity\":1,\"frequency_unit\":\"Day\",\"is_bad_habit\":false,\"is_flexible\":false,\"is_general\":false,\"title\":\"Stretch for 10 minutes\"},{\"due_time\":\"23:00\",\"emoji\":\"\\uD83D\\uDECF\\uFE0F\",\"frequency_quantity\":1,\"frequency_unit\":\"Day\",\"is_bad_habit\":false,\"is_flexible\":false,\"is_general\":false,\"title\":\"Lights out\"}]",
          "valueType": "text",
          "proposedValue": [
            {
              "title": "Read for 20 minutes",
              "emoji": "📖",
              "frequency_unit": "Day",
              "frequency_quantity": 1,
              "due_time": "21:30",
              "is_bad_habit": false,
              "is_general": false,
              "is_flexible": false
            },
            {
              "title": "Stretch for 10 minutes",
              "emoji": "🧘",
              "frequency_unit": "Day",
              "frequency_quantity": 1,
              "due_time": "21:30",
              "is_bad_habit": false,
              "is_general": false,
              "is_flexible": false
            },
            {
              "title": "Lights out",
              "emoji": "🛏️",
              "frequency_unit": "Day",
              "frequency_quantity": 1,
              "due_time": "23:00",
              "is_bad_habit": false,
              "is_general": false,
              "is_flexible": false
            }
          ],
          "isEditable": true
        },
        {
          "entityId": "00000000-0000-0000-0000-000000000000",
          "entityName": "Evening routine",
          "field": "parent_habit_id",
          "oldValue": null,
          "newValue": "No parent",
          "valueType": "text",
          "proposedValue": null,
          "isEditable": true
        }
      ],
      "stateFingerprint": "evening-state",
      "removesData": false
    }
  ],
  "previewFingerprint": "evening-preview",
  "actionKey": "createHabits"
}

export function makeEveningRoutinePreview(locale = 'en'): PendingAgentOperation {
  const operation = pendingAgentOperationSchema.parse(eveningRoutinePreview)
  if (locale === 'en') return operation
  const titles: Readonly<Record<string, string>> = {
    'Evening routine': 'Rotina da noite', 'Read for 20 minutes': 'Ler por 20 minutos',
    'Stretch for 10 minutes': 'Alongar por 10 minutos', 'Lights out': 'Apagar as luzes',
  }
  return pendingAgentOperationSchema.parse(JSON.parse(JSON.stringify(operation).replace(
    /Evening routine|Read for 20 minutes|Stretch for 10 minutes|Lights out/g,
    (title) => titles[title]!,
  )))
}

export function makeNestedHabitPreview(depth: number, reuse: boolean): PendingAgentOperation {
  let child: Record<string, unknown> = { title: 'Read', ...(reuse ? { habit_id: '00000000-0000-4000-8000-000000000002' } : {}) }
  for (let level = 1; level < depth; level++) child = { title: 'Routine', sub_habits: [child] }
  const operation = makeCreateHabitsPreview(1)
  const item = operation.items![0]!
  const field = { ...item.fields[0]!, field: 'sub_habits', newValue: JSON.stringify([child]), proposedValue: [child] }
  return pendingAgentOperationSchema.parse({ ...operation, actionKey: 'createSubHabit', capabilityId: 'habits.write',
    changes: [field], items: [{ ...item, fields: [field] }],
  })
}

export const childSchedulePreviewCases = [
  { name: 'weekday', child: { title: 'Tuesday child', frequency_unit: 'Day', frequency_quantity: 1, days: ['Tuesday'], is_flexible: false }, english: 'Tue', portuguese: 'Ter' },
  { name: 'one-time date', child: { title: 'Dated child', frequency_unit: 'OneTime', due_date: '2026-10-25', due_time: '21:30' }, english: 'Oct 25, 2026 · 21:30', portuguese: '25 de out. de 2026 · 21:30' },
  { name: 'week interval', child: { title: 'Fortnightly child', frequency_unit: 'Day', frequency_quantity: 1, days: ['Tuesday'], interval_weeks: 2, is_flexible: false }, english: 'Tue · Every 2 weeks', portuguese: 'Ter · A cada 2 semanas' },
  { name: 'end date and time', child: { title: 'Timed child', frequency_unit: 'Day', frequency_quantity: 1, due_time: '21:30', due_end_time: '23:00', end_date: '2026-10-25' }, english: 'Every day · 21:30 · Until 23:00 · Until Oct 25, 2026', portuguese: 'Todo dia · 21:30 · Até 23:00 · Até 25 de out. de 2026' },
] as const

export function makeChildSchedulePreview(child: Readonly<Record<string, unknown>>): PendingAgentOperation {
  const operation = makeEveningRoutinePreview()
  return pendingAgentOperationSchema.parse({ ...operation, items: operation.items!.map((item) => ({ ...item,
    fields: item.fields.map((field) => field.field === 'sub_habits'
      ? { ...field, newValue: JSON.stringify([child]), proposedValue: [child] } : field),
  })) })
}

export function makePlacementPreview(selected: 'sub_habit' | 'checklist_item' | 'new_parent' = 'checklist_item'): PendingAgentOperation {
  const operation = makeCreateHabitsPreview(2)
  const first = operation.items![0]!
  return pendingAgentOperationSchema.parse({ ...operation, items: [{ ...first,
    fields: [...first.fields, makeEveningRoutinePreview('en').items![0]!.fields.find((field) => field.field === 'sub_habits')!, ...[
      { field: 'parent_habit_id', newValue: 'Morning routine', proposedValue: '11111111-1111-4111-8111-111111111111', valueType: 'text' },
      { field: 'frequency_unit', newValue: 'Day', proposedValue: 'Day', valueType: 'text' },
      { field: 'frequency_quantity', newValue: '1', proposedValue: 1, valueType: 'number' },
      { field: 'due_time', newValue: '07:30', proposedValue: '07:30', valueType: 'time' },
      { field: 'reminder_enabled', newValue: 'True', proposedValue: true, valueType: 'boolean' },
      { field: 'tag_names', newValue: '["Health"]', proposedValue: ['Health'], valueType: 'text' },
      { field: 'goal_ids', newValue: '["22222222-2222-4222-8222-222222222222"]', proposedValue: ['22222222-2222-4222-8222-222222222222'], valueType: 'text' },
    ].map((field) => ({ entityId: emptyId, entityName: first.entityName, oldValue: null, isEditable: true, ...field }))],
    placement: {
      selected, recommended: 'checklist_item', reasonKey: 'chat.placement.destinationChecklist',
      reason: { en: 'You already keep 4 checklist items here.', 'pt-BR': 'Você já tem 4 itens no checklist aqui.' },
      alternatives: ['sub_habit', 'checklist_item', 'new_parent'].filter((value) => value !== selected),
      destinationId: '11111111-1111-4111-8111-111111111111', destinationName: 'Morning routine',
    },
  }, operation.items![1]!] })
}


export function makeReminderHabitPreview(reminder: 'enabled' | 'atTime' | 'before' | 'scheduled' | 'disabled'): PendingAgentOperation {
  const operation = makeCreateHabitsPreview(1)
  const item = operation.items![0]!
  const enabled = reminder !== 'disabled'
  const reminderTimes = reminder === 'scheduled' ? [] : [reminder === 'before' ? 15 : 0]
  const fields = makeSuggestionBatchPreview().items![0]!.fields.filter(field =>
    ['title', 'frequency_unit', 'frequency_quantity', 'due_time', 'reminder_enabled', 'reminder_times'].includes(field.field))
    .filter(field => reminder !== 'enabled' || field.field !== 'reminder_times')
    .map(field => {
      if (field.field === 'reminder_enabled') return { ...field, newValue: enabled ? 'True' : 'False', proposedValue: enabled }
      if (field.field === 'reminder_times') return { ...field, newValue: JSON.stringify(reminderTimes), proposedValue: reminderTimes }
      return field
    })
  if (reminder === 'scheduled') fields.push({ ...item.fields[0]!, field: 'scheduled_reminders', newValue: '[{"time":"20:00","when":"day_before"}]', proposedValue: [{ when: 'day_before', time: '20:00' }] })
  return pendingAgentOperationSchema.parse({ ...operation, items: [{ ...item, fields }] })
}
