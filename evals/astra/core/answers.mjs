import { tsImport } from 'tsx/esm/api'
import { optionTargets, questionAnswer, sameTitleCard, selectionLists } from '../same-title-card.mjs'

const { formatBlockAnswer } = await tsImport('../../../packages/shared/src/chat/block-answer.ts', import.meta.url)

const pickedRecord = (pick, records) => typeof pick === 'string' ? records[pick] : records[pick.of][pick.position]

// Producer: the shared pickListBlockSchema gives a list card one of three actions, and orbit-api
// AiBlockAnswerService.BuildPickListResponseAsync previews the bulk write of that action for the picked rows. So a
// list card can hold changes of one kind only.
const listCardKind = { create_habits: 'create', log_habits: 'log', skip_habits: 'skip' }
const askingKinds = ['choice', 'question', 'pickList']

// The cards of a reply that ask the person: a choice or question card, or a list card that asks the person to act on
// its rows. Only such a card is a question; a question in text is not.
export const questionCards = (response) => (response.parts ?? []).filter((part) => part?.type === 'block' && askingKinds.includes(part.kind))

// A reply without a preview is a question only when it shows a choice or question card, or a list card whose action
// can hold each change of the request. Producer: orbit-api ends a reply with a question only through a valid, accepted
// ask, which is such a card (AskTool.Description, ProcessUserChatCommand.Ask.cs ExecuteAskCallAsync); a question in
// text comes from an invalid ask, from the server fallback SelectionQuestion or from prose. So a list card of another
// action and a text-only reply fail the case, whatever the text says, and the person does not answer them.
export function questionOf(turn, expected) {
  const needed = [...new Set(expected.changes.map((change) => change.kind))]
  const cards = questionCards(turn.response)
  const unfit = cards.find((part) => part.kind === 'pickList' && needed.some((kind) => kind !== listCardKind[part.block.action]))
  if (unfit) {
    return { pass: false, reason: `The reply shows a list card that can only ${listCardKind[unfit.block.action]} habits; the request needs ${needed.join(' and ')}.` }
  }
  return cards.length ? { pass: true } : { pass: false, reason: 'The reply holds no preview and no question card.' }
}

// Producer: AiChoiceSelection.TargetsOf takes the target_ids that the ask declares for an option, and the option's own
// id only when that id is a record id; a list row names its record only in its ask arguments. The eval trace keeps the
// ask arguments, so a list card, and a card with an option that is not a record id, is answered only from the trace.
const answeredFromTrace = (card) => card.kind === 'pickList'
  || [...optionTargets(selectionLists(card), null).values()].some((targets) => !targets.length)

// The card answer that selects one record: the one option of the card that stands for exactly that record.
function pickOnCard(card, trace, recordId, locale) {
  const lists = selectionLists(card)
  if (lists.length !== 1) return null
  const targets = optionTargets(lists, trace)
  const option = lists[0].options.find((candidate) => targets.get(candidate.id).length === 1 && targets.get(candidate.id)[0] === recordId)
  if (!option) return null
  if (card.kind === 'question') return questionAnswer(card, [{ list: lists[0], chosen: [option] }], locale)
  return { message: formatBlockAnswer([option.label], undefined, locale),
    blockAnswer: { blockId: card.block.blockId, selectedIds: [option.id] } }
}

const recordOfRow = (rowArguments) => {
  try {
    const parsed = typeof rowArguments === 'string' ? JSON.parse(rowArguments) : rowArguments
    return typeof parsed?.habit_id === 'string' ? parsed.habit_id : null
  } catch {
    return null
  }
}

// The record of each row of a list card, or null when the grader cannot read one. Producer: orbit-api AskTool gives
// each row the arguments of one item of the bulk write, and a log or skip item names its record as habit_id (a JSON
// string is read as its object, ExpandPickListArguments); AskToolArgumentsValidator.ToDefinition keeps the row ids.
// Both paths that issue a list card record its ask call in the eval trace (RecordToolRound for the model's ask,
// TryIssueSelectionPickListAsync for the server's), so a row's record is read there and never from its label.
function rowRecords(card, trace) {
  const rows = card.block.items.map((item) => item.id)
  const asks = (trace?.calls ?? []).filter((call) => call.name === 'ask' && call.resultStatus === 'Succeeded')
    .map((call) => call.arguments?.input)
    .filter((input) => input?.form === 'pickList' && input.action === card.block.action && Array.isArray(input.items)
      && input.items.length === rows.length && input.items.every((row, index) => row?.id === rows[index]))
  if (asks.length !== 1) return null
  const records = new Map(asks[0].items.map((row) => [row.id, recordOfRow(row.arguments)]))
  return [...records.values()].every(Boolean) ? records : null
}

// The list answer that selects one record, as the shipped AnswerBlock sends it: the row that stands for that record.
// Null when no row stands for it. A trace whose ask call does not map each row is a limit of the grader.
function pickOnList(card, trace, recordId, locale) {
  const records = rowRecords(card, trace)
  if (!records) return { limit: true }
  const row = card.block.items.find((item) => records.get(item.id) === recordId)
  return row ? { message: formatBlockAnswer([row.label], undefined, locale), blockAnswer: { blockId: card.block.blockId, selectedIds: [row.id] } } : null
}

// What the person does when the assistant asks with a card (questionOf): answer it through blockAnswer when the card
// can hold the decision of the case, and type the decision when it cannot. A same-title card that cannot hold the decision fails
// the case, because the person cannot answer it.
export function answerQuestion(turn, vars) {
  const { answer, records } = vars.core
  const locale = vars.clientContext.locale
  if (!answer) return { pass: false, reason: 'The assistant asked, and the request needs no question.' }
  const cards = questionCards(turn.response)
  if (cards.length > 1) return { pass: false, reason: 'The question turn shows more than one card.' }
  const [card] = cards
  // A missing trace is a missing precondition of the run (the trace flag of the eval account), not a fault of the build
  // and not a limit of the grader: the case gives no evidence and continues in a later window.
  if (!turn.trace && answeredFromTrace(card)) {
    return { pass: false, unavailable: true, reason: 'The card answer needs the eval trace of the turn, and the turn returned none.' }
  }
  if (answer.sameTitle) {
    const sameTitle = sameTitleCard({ composition: turn.response, trace: turn.trace }, { clientContext: vars.clientContext,
      sameTitleBaseline: { children: records.children.map((id) => ({ id })) },
      sameTitleSet: { answer: { ...answer.sameTitle, text: answer.text[locale] } } })
    return sameTitle.pass ? sameTitle : { ...sameTitle, graderLimit: sameTitle.reason.startsWith('The grader cannot') }
  }
  const recordId = pickedRecord(answer.pick, records)
  const selection = card.kind === 'pickList' ? pickOnList(card, turn.trace, recordId, locale) : pickOnCard(card, turn.trace, recordId, locale)
  if (selection?.limit) {
    return { pass: false, graderLimit: true, reason: 'The grader cannot tell which record each row of the list card stands for.' }
  }
  return { pass: true, ...(selection ?? { message: answer.text[locale] }) }
}
