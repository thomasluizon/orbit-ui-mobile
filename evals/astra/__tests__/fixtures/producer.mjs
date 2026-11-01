import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { completionControls, nullableSchema, resolveSchema, schemaVariants } from '../../tool-schema.mjs'

const { tools, legacyTools, postReadTools } = parse(readFileSync(new URL('../../catalog.yaml', import.meta.url), 'utf8'))
const normalizeField = (name) => name.replaceAll('_', '').replaceAll('-', '').toLowerCase()

// StrictToolSchema requires nullable properties; composition reads require completion; traces omit marked fields.
function strictArguments(schema, supplied, root = schema, complete = false) {
  if (!supplied || typeof supplied !== 'object') return supplied
  const variants = schemaVariants(schema, root).filter((variant) => variant.type !== 'null')
  // Default only an unambiguous shape; form unions are supplied by the fixture.
  const resolved = variants.length === 1 ? variants[0] : resolveSchema(schema, root)
  if (Array.isArray(supplied)) return supplied.map((entry) => strictArguments(resolved?.items, entry, root))
  const properties = resolved?.properties ?? {}
  const defaults = Object.fromEntries(Object.entries(properties)
    .filter(([, property]) => nullableSchema(property, root))
    .map(([name]) => [name, null]))
  for (const name of completionControls(resolved)) defaults[name] = complete
  return { ...defaults, ...Object.fromEntries(Object.entries(supplied)
    .map(([name, value]) => [name, strictArguments(properties[name], value, root)])) }
}

// Producer: ProcessUserChatCommand.EvalTrace.cs applies schema marks to arguments and result envelopes.
function omitSensitiveFields(value, sensitiveFields) {
  if (Array.isArray(value)) return value.map((entry) => omitSensitiveFields(entry, sensitiveFields))
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value)
    .filter(([name]) => !sensitiveFields.has(normalizeField(name)))
    .map(([name, entry]) => [name, omitSensitiveFields(entry, sensitiveFields)]))
}

// Contract: orbit-api 5e376417, ChatResponse, ChatEvalTrace and AiToolCallResult.
export function toolCall(name, arguments_, status = 'Succeeded', id = 'call-1', clientContext = {}, complete = false) {
  const catalog = clientContext.supportsParts === true ? [...tools, ...postReadTools] : legacyTools
  const tool = catalog.find((entry) => entry.function.name === name)
  const schema = tool?.function.parameters
  const sensitiveFields = new Set(tool?.sensitiveFields)
  return {
    id, name, arguments: omitSensitiveFields(strictArguments(schema, arguments_, schema, complete), sensitiveFields), status,
    result: omitSensitiveFields({
      name, id, success: status === 'Succeeded' || status === 'PendingConfirmation',
      entityId: null,
      entityName: status === 'Succeeded' && name === 'query_habits'
        ? 'No habits found matching the given filters.' : null,
      error: null,
      payload: status === 'PendingConfirmation' ? {
        status: 'awaiting_confirmation', item_count: null, habit_count: null, date_count: null,
        proposed_titles: null, preview_items: null, dates: null,
        instruction: 'The preview is the entire answer. Emit no prose before or after it. All preview facts come exclusively from preview_items.',
      } : null,
    }, sensitiveFields),
  }
}

// Producer: ProcessUserChatCommand.ToolResults.cs:60-84 and HabitListCard.cs:9-16.
export function habitAccountRead(selection = false, id = 'read', clientContext = { supportsParts: true }) {
  const call = toolCall('query_habits', { for_selection: selection }, 'Succeeded', id, clientContext)
  call.result.payload = selection
    ? { selection_required: true, reference: null, candidates: [],
      instruction: 'Ask the person to select from these candidates using a supported ask form. Do not choose an ID or prepare any write before the answer.' }
    : { scope: 'all', items: [] }
  if (!selection) call.result.readDirective = `[[orbit:read:${id}]]`
  return call
}

export const traceTiming = { totalMilliseconds: 125.5, phases: [
  { name: 'model', milliseconds: 100, elapsedMilliseconds: 100 },
  { name: 'tools', milliseconds: '25.5', elapsedMilliseconds: 125.5 },
] }

export function chatResponse(requestId, toolCalls = []) {
  return {
    aiMessage: 'Water is ready.', actions: [], operations: null, pendingOperations: null,
    policyDenials: null, correlationId: requestId, relatedSurfaces: null, habitList: null,
    goalList: null, metricsCard: null, periodInsight: null, daySummary: null, streak: null,
    calendar: null, recordLists: null, accountRows: null, followUps: null,
    evalTrace: { traceId: requestId, toolCalls, timing: traceTiming },
  }
}

export const habitBlock = { type: 'block', kind: 'habitList', block: { scope: 'today', items: [
  { id: 'water', title: 'Water', emoji: null, depth: 0, isBadHabit: false, status: 'today' },
], totalCount: 1 } }

export function preview(name = 'Cholesterol exam') {
  return { id: '11111111-1111-4111-8111-111111111111', capabilityId: 'habits.bulk.write', displayName: 'bulk_create_habits',
    summary: 'Create proposed habits', riskClass: 'Low', confirmationRequirement: 'FreshConfirmation', expiresAtUtc: '2026-10-26T20:00:00Z',
    changes: null, changeTargetCount: 1, previewFingerprint: 'preview', actionKey: 'createHabits', items: [{
      itemId: 'exam', entityId: null, entityName: name, stateFingerprint: 'state', removesData: null,
      fields: [
        { entityId: '00000000-0000-0000-0000-000000000000', entityName: name, field: 'due_time', oldValue: null, newValue: '15:50', valueType: 'time', proposedValue: '15:50', isEditable: true },
        { entityId: '00000000-0000-0000-0000-000000000000', entityName: name, field: 'frequency_unit', oldValue: null, newValue: 'OneTime', valueType: 'enum', proposedValue: 'OneTime', isEditable: true },
      ],
    }] }
}

// Producer fixture: #1754 ProcessUserChatCommandHandlerTests.Timing read turn.
export function turnTiming() {
  const names = ['moderation', 'context_load', 'context_load', 'prompt_build', 'budget', 'budget',
    'model_call', 'budget', 'tool_call', 'budget', 'budget', 'model_call', 'budget', 'save', 'composition', 'other']
  const durations = [1, 2, 0, 3, 11, 0, 13, 0, 7, 11, 0, 13, 0, 5, 0, 0]
  return { totalMilliseconds: 66, phases: names.map((name, index) => ({
    name, milliseconds: durations[index], elapsedMilliseconds: durations[index],
  })) }
}

// Contract: orbit-api HabitSuggestionDraft and HabitSuggestionsCard.
export function suggestionDraft(overrides = {}) {
  return { id: '11111111-1111-4111-8111-111111111111', emoji: '📖', title: 'Read', type: 'Habit',
    frequencyUnit: 'Day', frequencyQuantity: 1, days: [], dueDate: '2026-10-26',
    dueTime: '21:00:00', dueEndTime: '21:10:00', reminderMinutesBefore: 5,
    checklistItems: ['Read one page'], reason: 'A small evening routine.', ...overrides }
}

export function suggestionResponse(requestId, locale = 'en') {
  const portuguese = locale === 'pt-BR'
  const introduction = portuguese ? 'Aqui estão sugestões para sua rotina.' : 'Here are suggestions for your routine.'
  const drafts = [suggestionDraft(portuguese ? { title: 'Ler', checklistItems: ['Ler uma página'], reason: 'Um momento de leitura antes de dormir.' } : {}),
    suggestionDraft({ id: '22222222-2222-4222-8222-222222222222', emoji: '🧘',
      title: portuguese ? 'Alongamento' : 'Stretch', dueTime: '21:15:00', dueEndTime: '21:20:00',
      checklistItems: [portuguese ? 'Alongar as pernas' : 'Stretch your legs'],
      reason: portuguese ? 'Soltar o corpo no fim do dia.' : 'Relax at the end of the day.' })]
  const call = toolCall('suggest_habits', { instruction: portuguese ? 'hábitos para a noite' : 'evening habits', language: locale, count: 2 },
    'Succeeded', 'call-1', { supportsParts: true })
  call.result.payload = { language: locale, drafts }
  return { ...chatResponse(requestId, [call]),
    operations: [{ operationId: 'suggest_habits', sourceName: 'suggest_habits', riskClass: 'Low',
      confirmationRequirement: 'None', status: 'Succeeded', summary: null, targetId: null, targetName: null,
      policyReason: null, pendingOperationId: null, payload: { language: locale, drafts } }],
    aiMessage: introduction, parts: [{ type: 'text', text: introduction },
      { type: 'block', kind: 'habitSuggestions', block: { language: locale, drafts } }] }
}

// Producer: ProcessUserChatCommand.CreationReads.cs, AwaitCreationReads.
export function deferredCreationCall(arguments_ = { habits: [] }) {
  const call = toolCall('bulk_create_habits', arguments_, 'Succeeded', 'deferred-creation')
  call.result.payload = { status: 'awaiting_reads',
    instruction: 'Nothing was previewed or saved. Read the results from this round first, then call bulk_create_habits once with the complete set. Reuse each existing habit\'s ID and stored title verbatim. Copy selected suggestion draft fields unchanged, without inventing quantities, times or activities.' }
  return call
}

// Producer: ToolResult.FromFailure and HabitCapacityFailure, serialized by BuildToolCallResult.
export function capacityFailureCall() {
  const call = toolCall('create_habit', { title: 'Stretch', frequency_unit: 'Day' }, 'Failed')
  call.result.error = "You've reached the {0} habit limit."
  call.result.payload = { error: call.result.error, arguments: [1000], errorCode: 'HABIT_LIMIT_REACHED' }
  return call
}

// Producer: PendingAgentOperationStore.Map for the StepUp requirement from ApiKeyManagementAuthorization.
export function apiKeysStepUpResponse(requestId, clientContext) {
  const pending = { id: '11111111-1111-4111-8111-111111111111', capabilityId: 'api-keys.read',
    displayName: 'Read API Keys', summary: 'GetApiKeys requested via chat', riskClass: 'Low',
    confirmationRequirement: 'StepUp', expiresAtUtc: '2026-10-30T20:00:00Z', changes: null,
    changeTargetCount: null, items: null, previewFingerprint: null, actionKey: 'viewApiKeys' }
  return { ...chatResponse(requestId, [toolCall('get_api_keys', {}, 'PendingConfirmation', 'call-1', clientContext)]),
    aiMessage: '', parts: [], pendingOperations: [pending] }
}
