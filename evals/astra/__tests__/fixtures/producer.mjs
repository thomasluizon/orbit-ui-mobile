import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { completionControls, nullableSchema, resolveSchema, schemaVariants } from '../../tool-schema.mjs'

const exported = parse(readFileSync(new URL('../../catalog.yaml', import.meta.url), 'utf8'))
const { changeKinds, planTitleArgument, wrapperName, changesArgument, shapes } = exported.changePlan
// The declaration shapes of the change list that the catalog holds (orbit-api ChangeDeclarationShape).
export const changeShapes = Object.keys(shapes)
// The ai_change_plan path has no post-read declaration (catalog-export.cs). Each shape declares the same read tools and
// the same ask, so a read or an ask of this path takes the lists of the first shape.
const changePlanLists = { ...shapes[changeShapes[0]], postReadTools: [], offerPostReadTools: [] }
const normalizeField = (name) => name.replaceAll('_', '').replaceAll('-', '').toLowerCase()

// StrictToolSchema requires nullable properties; composition reads require completion; traces omit marked fields.
function strictArguments(schema, supplied, root = schema, complete = false) {
  if (!supplied || typeof supplied !== 'object') return supplied
  const variants = schemaVariants(schema, root).filter((variant) => variant.type !== 'null')
  // The flag-on ask declares two choice forms, so a form that declares each supplied field wins over the first of its name.
  const forms = variants.filter((variant) => resolveSchema(variant.properties?.form, root)?.enum?.includes(supplied.form))
  const selected = forms.find((variant) => Object.keys(supplied).every((name) => Object.hasOwn(variant.properties, name))) ?? forms[0]
  const resolved = selected ?? (variants.length === 1 ? variants[0] : resolveSchema(schema, root))
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
export const toolCall = (...call) => declaredCall(exported, ...call)
// The same call against the declarations of the ai_change_plan path.
export const changePlanToolCall = (...call) => declaredCall(changePlanLists, ...call)

function declaredCall({ tools, legacyTools, postReadTools, offerTools, offerPostReadTools }, name, arguments_, status = 'Succeeded', id = 'call-1', clientContext = {}, complete = false) {
  const catalog = clientContext.supportsProactiveOffers === true ? [...offerTools, ...offerPostReadTools]
    : clientContext.supportsParts === true ? [...tools, ...postReadTools] : legacyTools
  const tool = catalog.find((entry) => entry.function.name === name)
  const schema = tool?.function.parameters
  // Producer: ProactiveReadOffer.Instruction and ProactiveOfferDismissal.Instruction retain raw model arguments in traces.
  const controls = {
    ...(schema?.properties?.orbit_offer_intent ? { orbit_offer_intent: 'none' } : {}),
    ...(schema?.properties?.orbit_dismissed_offer_keys ? { orbit_dismissed_offer_keys: [] } : {}),
  }
  return tracedCall(name, id, strictArguments(schema, { ...controls, ...arguments_ }, schema, complete), status,
    new Set(tool?.sensitiveFields))
}

function tracedCall(name, id, arguments_, status, sensitiveFields) {
  return {
    id, name, arguments: omitSensitiveFields(arguments_, sensitiveFields), status,
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

// Producer: orbit-api ChangeListReplayTests.ChangeList_TheEvalTraceRecordsEachChangeWithItsKindAndArguments. The model
// sends one list with a delete change of two habits and a rename change of four habits, and it states completion.
export const changeListHabits = ['44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666', '77777777-7777-4777-8777-777777777777',
  '88888888-8888-4888-8888-888888888888', '99999999-9999-4999-8999-999999999999']
export const changeList = [
  { id: 'delete', kind: 'bulk_delete_habits', arguments: { habit_ids: changeListHabits.slice(4) } },
  { id: 'rename', kind: 'bulk_update_habits',
    arguments: { filter: { habit_ids: changeListHabits.slice(0, 4) }, updates: { title: 'Water - 1.18L' } } },
]

// The eval trace of a change list in one shape. Producer: ChangeDeclarations.Read gives each change one traced call with
// the name of its kind, the id of the change and the arguments of the change, each with the status PendingConfirmation.
// A kind call of the kinds shape loses its plan title. A change of the wrapper shape is one item of the list, and the
// wrapper holds the completion control and the plan title at its top level.
export function changeListTrace(shape, clientContext = { supportsParts: true }, changes = changeList) {
  const { tools, legacyTools, offerTools } = shapes[shape]
  const list = clientContext.supportsProactiveOffers === true ? offerTools : clientContext.supportsParts === true ? tools : legacyTools
  const wrapper = list.find((entry) => entry.function.name === wrapperName)?.function.parameters
  return changes.map((change) => tracedCall(change.kind, change.id,
    wrapper ? wrappedArguments(wrapper, change) : kindArguments(list, change), 'PendingConfirmation',
    new Set(changeKinds.find((entry) => entry.name === change.kind).sensitiveFields)))
}

function kindArguments(list, change) {
  const schema = list.find((entry) => entry.function.name === change.kind).function.parameters
  const sent = strictArguments(schema, change.arguments, schema, true)
  return Object.fromEntries(Object.entries(sent).filter(([name]) => name !== planTitleArgument))
}

function wrappedArguments(wrapper, change) {
  const item = wrapper.properties[changesArgument].items.anyOf.find((entry) => entry.properties.kind.enum.includes(change.kind))
  return strictArguments(item.properties.arguments, change.arguments, wrapper)
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
