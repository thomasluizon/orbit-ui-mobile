import { isDeepStrictEqual } from 'node:util'

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value) => typeof value === 'string' && value.trim().length > 0
const uuid = (value) => typeof value === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)
  && value !== '00000000-0000-0000-0000-000000000000'
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const normalize = (value) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()
const time = (value) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d:00$/.test(value)
const date = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
const result = (pass, reason) => ({ pass, score: pass ? 1 : 0, reason })

// Contract: HabitSuggestionDraft.ToHabit and HabitSuggestionService.Normalize in orbit-api.
export function validDraft(draft, today) {
  if (!object(draft) || !uuid(draft.id) || !text(draft.emoji) || draft.emoji.length > 10
    || !text(draft.title) || !text(draft.reason) || draft.reason.length > 240 || /\r|\n/.test(draft.reason)
    || !date(draft.dueDate) || !time(draft.dueTime) || !time(draft.dueEndTime) || draft.dueEndTime <= draft.dueTime
    || !Array.isArray(draft.days) || new Set(draft.days).size !== draft.days.length || !draft.days.every((day) => weekdays.includes(day))
    || !Array.isArray(draft.checklistItems) || !draft.checklistItems.every(text)
    || !(draft.reminderMinutesBefore === null || Number.isInteger(draft.reminderMinutesBefore)
      && draft.reminderMinutesBefore >= 0 && draft.reminderMinutesBefore <= 1440)
    || !(draft.existingHabitId === undefined || draft.existingHabitId === null || uuid(draft.existingHabitId))) return false
  if (today && (draft.dueDate < today || Date.parse(draft.dueDate) > Date.parse(today) + 366 * 86400000)) return false
  return draft.type === 'Task' ? draft.frequencyUnit === null && draft.frequencyQuantity === null && !draft.days.length
    : draft.type === 'Habit' && ['Day', 'Week', 'Month', 'Year'].includes(draft.frequencyUnit)
      && Number.isInteger(draft.frequencyQuantity) && draft.frequencyQuantity > 0
      && (!draft.days.length || draft.frequencyUnit === 'Day' && draft.frequencyQuantity === 1)
}

export function suggestionComposition(response, vars) {
  const parts = response.parts
  const blocks = Array.isArray(parts) ? parts.filter((part) => part?.type === 'block') : []
  const card = blocks?.[0]?.block
  const drafts = card?.drafts
  const expected = vars.composition
  if (vars.clientContext?.supportsParts !== true || !vars.clientContext.partKinds?.includes('habitSuggestions')
    || !Array.isArray(parts) || !parts.every((part) => object(part) && ['text', 'block'].includes(part.type)) || blocks.length !== 1 || blocks[0].kind !== 'habitSuggestions'
    || !object(card) || card.language !== vars.clientContext.locale || !Array.isArray(drafts)
    || drafts.length !== expected.count || !drafts.every((draft) => validDraft(draft, vars.accountDate))) {
    return result(false, 'Missing or malformed ready-to-create suggestion drafts.')
  }
  const intro = card.language === 'pt-BR' ? 'Aqui estão sugestões para sua rotina.' : 'Here are suggestions for your routine.'
  const blockIndex = parts.findIndex((part) => part.type === 'block')
  if (!((blockIndex === 0 && parts.length === 1 && !response.aiMessage)
    || (blockIndex === 1 && parts.length === 2 && parts[0].type === 'text' && parts[0].text === intro && response.aiMessage === intro))
    || ['actions', 'pendingOperations', 'policyDenials'].some((key) => response[key]?.length)
    || (response.operations ?? []).some((operation) => operation.status !== 'Succeeded')) {
    return result(false, 'Suggestion drafts must lead the answer, allowing only the server introduction.')
  }
  if (new Set(drafts.map((draft) => draft.id)).size !== drafts.length
    || new Set(drafts.map((draft) => normalize(draft.title))).size !== drafts.length
    || new Set(drafts.flatMap((draft) => draft.existingHabitId ? [draft.existingHabitId] : [])).size
      !== drafts.filter((draft) => draft.existingHabitId).length) return result(false, 'Duplicate suggestion drafts.')
  if (drafts.some((draft) => draft.existingHabitId && !(expected.existing ?? []).some((existing) => existing.id === draft.existingHabitId))) {
    return result(false, 'Suggestion references an unexpected existing habit.')
  }
  for (const existing of expected.existing ?? []) {
    const matches = drafts.filter((draft) => normalize(draft.title) === normalize(existing.title) || draft.existingHabitId === existing.id)
    if (matches.length !== 1 || matches[0].existingHabitId !== existing.id) return result(false, 'Existing habit was duplicated or lost its existingHabitId.')
  }
  return result(true, 'Verified suggestion block and existing habit targets.')
}

export function refineResult(output, vars) {
  const original = vars.refineDraft
  const revised = output?.refinedDraft
  if (output?.httpStatus !== 200 || !validDraft(original, vars.accountDate) || !validDraft(revised, vars.accountDate)
    || revised.id !== original.id || revised.existingHabitId !== original.existingHabitId
    || isDeepStrictEqual(original, revised) || !Array.isArray(vars.baselineDrafts) || !Array.isArray(output.drafts)
    || output.drafts.length !== vars.baselineDrafts.length) return result(false, 'Refine did not return one valid rewritten draft with its original identity.')
  if (!vars.baselineDrafts.every((draft, index) => isDeepStrictEqual(output.drafts[index], draft.id === original.id ? revised : draft))) {
    return result(false, 'Refine changed another draft or the draft order.')
  }
  for (const [field, value] of Object.entries(vars.refine.expected ?? {})) {
    if (!isDeepStrictEqual(revised[field], value)) return result(false, `Refine did not apply the requested ${field}.`)
  }
  return result(true, 'Verified one rewritten draft and unchanged siblings.')
}

export function suggestionAnswer(parts, locale) {
  return JSON.stringify({ parts: parts.map((part) => {
    if (part.type === 'text') return { type: 'text', text: part.text }
    if (part.kind !== 'habitSuggestions' || !Array.isArray(part.block?.drafts)
      || !part.block.drafts.every((draft) => validDraft(draft))) throw new Error('Malformed suggestion block.')
    return { type: 'block', kind: part.kind, block: { drafts: part.block.drafts.map(({ id, existingHabitId, dueDate, ...draft }) => ({
      ...draft, dueDate: new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${dueDate}T12:00:00Z`)),
      existingHabit: Boolean(existingHabitId),
    })) } }
  }) })
}
