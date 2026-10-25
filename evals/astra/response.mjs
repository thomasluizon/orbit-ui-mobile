export function extractTrace(response, responseRequestId) {
  const trace = response?.evalTrace
  if (!trace || typeof trace.traceId !== 'string' || !trace.traceId.trim() || !Array.isArray(trace.toolCalls)) {
    return { state: 'unavailable', reason: 'Missing or malformed opt-in eval trace.' }
  }
  if (trace.traceId !== responseRequestId) {
    return { state: 'mismatched', reason: 'Trace and HTTP response identities differ.' }
  }
  return {
    state: 'available', requestId: trace.traceId, responseRequestId,
    calls: trace.toolCalls.map((call) => ({
      id: call?.id, name: call?.name, arguments: call?.arguments,
      resultStatus: call?.status, result: call?.result,
    })),
  }
}

const compositionKeys = ['aiMessage', 'parts', 'actions', 'operations', 'pendingOperations', 'policyDenials',
  'relatedSurfaces', 'followUps', 'followUpContext']
const privateKeys = new Set(['read', 'payload', 'refreshToken', 'queryToken', 'nextCursor', 'previewFingerprint',
  'stateFingerprint', 'expiresAtUtc', 'correlationId', 'readBlock', 'proposedValue'])
const previewTextFields = new Set(['title', 'name', 'emoji', 'description', 'frequency_unit', 'frequency_quantity',
  'interval_weeks', 'due_date', 'date', 'due_time', 'end_date', 'due_end_time', 'deadline', 'expires_at_utc',
  'is_general', 'is_flexible', 'is_bad_habit', 'reminder_enabled', 'enabled', 'slip_alert_enabled', 'is_completed',
  'is_read_only', 'release_other_account', 'uses_24_hour_clock', 'parent_habit_id', 'current_value', 'target_value',
  'unit', 'goal_type', 'status', 'note', 'subject', 'message', 'email', 'text', 'summary', 'color', 'action',
  'timezone', 'language', 'week_start_day', 'theme_preference', 'interval', 'delete', 'dismiss_import', 'run_sync'])

function previewField({ field, newValue, proposedValue }) {
  if (['tag_ids', 'goal_ids', 'habit_ids', 'positions', 'scopes'].includes(field)) {
    return Array.isArray(proposedValue) ? { field, count: proposedValue.length } : null
  }
  if (field === 'sub_habits') return Array.isArray(proposedValue) ? { field, items: proposedValue.map((child) => ({
    title: child.title,
    fields: Object.entries(child).map(([field, value]) => previewField({ field,
      newValue: value == null || typeof value === 'string' ? value : JSON.stringify(value), proposedValue: value })).filter(Boolean),
  })) } : null
  if (['days', 'checklist_items', 'reminder_times', 'scheduled_reminders', 'tag_names', 'items'].includes(field)) {
    if (!Array.isArray(proposedValue)) return null
    return { field, values: proposedValue.map((entry) => {
      if (!entry || typeof entry !== 'object') return entry
      return field === 'checklist_items' ? { text: entry.text, is_checked: entry.is_checked }
        : { when: entry.when, time: entry.time }
    }) }
  }
  if (['parent_id', 'new_parent_id'].includes(field)) return { field, movesToRoot: !newValue }
  return previewTextFields.has(field) ? { field, newValue } : null
}

function finalAnswer(composition) {
  const visible = (value) => {
    if (Array.isArray(value)) return value.map(visible)
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !privateKeys.has(key)).map(([key, child]) => [key, visible(child)]))
    return value
  }
  return JSON.stringify(visible({ ...composition,
    pendingOperations: composition.pendingOperations?.map(visiblePreview),
  }))
}

function visiblePreview(operation) {
  const items = operation.items?.length ? operation.items : Object.values((operation.changes ?? []).reduce((groups, field) => {
    groups[field.entityId] ??= { entityName: field.entityName, fields: [] }
    groups[field.entityId].fields.push(field)
    return groups
  }, Object.create(null)))
  return { count: operation.changeTargetCount ?? items.length, items: items.map((item) => ({
    title: item.fields?.find((field) => ['title', 'name'].includes(field.field))?.newValue || item.entityName,
    removesData: item.removesData,
    fields: item.fields?.filter((field) => field.field !== 'parent_habit_id'
      || !item.fieldOptions?.some((option) => option.field === 'parent_habit_id')).map(previewField).filter(Boolean),
    parentChoices: item.fieldOptions?.filter((field) => field.field === 'parent_habit_id')
      .flatMap((field) => field.options.map((option) => option.label)),
  })) }
}

export default function parseResponse(response, _text, context) {
  const httpStatus = context?.response?.status ?? 200
  const responseRequestId = context?.response?.headers?.['x-orbit-request-id']
  if (httpStatus === 403) {
    if (response?.errorCode !== 'PAY_GATE' || typeof response.error !== 'string' || !response.error.trim()) {
      return { error: 'Astra returned an unexpected refusal.' }
    }
    return { answer: response.error, composition: { aiMessage: response.error }, httpStatus, trace: { state: 'refused', responseRequestId } }
  }
  if (httpStatus !== 200) return { error: `Astra returned HTTP ${httpStatus}.` }
  if (response?.aiMessage != null && typeof response.aiMessage !== 'string') return { error: 'Astra returned malformed final text.' }
  const composition = Object.fromEntries(compositionKeys.filter((key) => response && Object.hasOwn(response, key))
    .map((key) => [key, response[key]]))
  const hasSurface = (Array.isArray(response?.parts) && response.parts.some((part) => part?.type === 'block'))
    || ['pendingOperations', 'actions', 'operations', 'policyDenials'].some((key) => Array.isArray(response?.[key]) && response[key].length > 0)
  if (!response || (!hasSurface && (typeof response.aiMessage !== 'string' || !response.aiMessage.trim()))) {
    return { error: 'Astra did not return a nonempty aiMessage final answer.' }
  }
  return { answer: hasSurface ? finalAnswer(composition) : response.aiMessage, composition, httpStatus, trace: extractTrace(response, responseRequestId) }
}
