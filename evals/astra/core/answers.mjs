import { tsImport } from 'tsx/esm/api'
import { optionTargets, questionAnswer, sameTitleCard, selectionLists, shownCards } from '../same-title-card.mjs'

const { formatBlockAnswer } = await tsImport('../../../packages/shared/src/chat/block-answer.ts', import.meta.url)

const pickedRecord = (pick, records) => typeof pick === 'string' ? records[pick] : records[pick.of][pick.position]

// Producer: the shared pickListBlockSchema gives a list card one of three actions, and orbit-api
// AiBlockAnswerService.BuildPickListResponseAsync previews the bulk write of that action for the picked rows. So a
// list card can hold changes of one kind only.
const listCardKind = { create_habits: 'create', log_habits: 'log', skip_habits: 'skip' }
const listCards = (response) => (response.parts ?? []).filter((part) => part?.type === 'block' && part.kind === 'pickList')
const textOf = (response) => [response.aiMessage, ...(response.parts ?? []).filter((part) => part?.type === 'text').map((part) => part.text)]
  .filter(Boolean).join(' ')

// The phrases of both locales that report a change as done: a first-person past write verb, a passive form of one,
// or a sentence that a sign-off word opens. Without a preview no change is done, so a question after such a report
// ("Quer mais alguma coisa?") asks nothing about the request.
const completionClaims = [
  /\bI(?:'ve|’ve| have)?(?: just| already| now)? (?:deleted|removed|renamed|updated|changed|created|added|logged|marked|checked off|skipped|moved|saved|made the changes?)\b/iu,
  /\b(?:has|have) been (?:deleted|removed|renamed|updated|changed|created|added|logged|marked|skipped|moved|saved)\b/iu,
  /(?<![\p{L}\p{N}])(?:excluí|apaguei|deletei|removi|renomeei|mudei|troquei|alterei|atualizei|criei|adicionei|registrei|marquei|pulei|salvei|coloquei|fiz as (?:mudanças|alterações))(?![\p{L}\p{N}])/iu,
  /(?<![\p{L}\p{N}])(?:foi|foram) (?:excluíd|apagad|removid|deletad|renomead|alterad|atualizad|criad|adicionad|registrad|marcad|salv)[ao]s?(?![\p{L}\p{N}])/iu,
  /(?:^|[.!?]\s+)(?:done|all set|all done|pronto|prontinho|feito|tudo certo)\s*[!.,]/iu,
]

// What a reply without a preview is, for a request that changes the account. It is a question when it shows a choice or
// question card, a list card whose action can hold each change of the request, or a text that asks and reports no
// change as done. A list card of another action cannot hold the request, a text that reports the change as done
// leaves the person with a false outcome, and a reply that asks nothing leaves the person without a preview; each
// fails the case, and the person does not answer it.
export function questionOf(turn, expected) {
  const needed = [...new Set(expected.changes.map((change) => change.kind))]
  const lists = listCards(turn.response)
  const unfit = lists.find((part) => needed.some((kind) => kind !== listCardKind[part.block.action]))
  if (unfit) {
    return { pass: false, reason: `The reply shows a list card that can only ${listCardKind[unfit.block.action]} habits; the request needs ${needed.join(' and ')}.` }
  }
  if (lists.length || shownCards({ composition: turn.response }).length) return { pass: true }
  const text = textOf(turn.response)
  if (completionClaims.some((claim) => claim.test(text))) return { pass: false, reason: 'The reply reports a change as done, and no preview holds it.' }
  return /[?？]/u.test(text) ? { pass: true } : { pass: false, reason: 'The reply holds no preview, no question card and no question.' }
}

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
// string is read as its object, ExpandPickListArguments). The eval trace keeps the arguments of the ask call, also
// for the list that TryIssueSelectionPickListAsync builds, so a row's record is read there and never from its label.
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
// Null when no row stands for it; a limit of the grader when it cannot tell which record a row stands for.
function pickOnList(card, trace, recordId, locale) {
  const records = rowRecords(card, trace)
  if (!records) return { limit: true }
  const row = card.block.items.find((item) => records.get(item.id) === recordId)
  return row ? { message: formatBlockAnswer([row.label], undefined, locale), blockAnswer: { blockId: card.block.blockId, selectedIds: [row.id] } } : null
}

// What the person does when the assistant asks: answer the card through blockAnswer when the card can hold the
// decision of the case, and type the decision when no card can. A same-title card that cannot hold the decision fails
// the case, because the person cannot answer it.
export function answerQuestion(turn, vars) {
  const { answer, records } = vars.core
  const locale = vars.clientContext.locale
  if (!answer) return { pass: false, reason: 'The assistant asked, and the request needs no question.' }
  const output = { composition: turn.response, trace: turn.trace }
  if (answer.sameTitle) {
    const card = sameTitleCard(output, { clientContext: vars.clientContext,
      sameTitleBaseline: { children: records.children.map((id) => ({ id })) },
      sameTitleSet: { answer: { ...answer.sameTitle, text: answer.text[locale] } } })
    return card.pass ? card : { ...card, graderLimit: card.reason.startsWith('The grader cannot') }
  }
  const cards = [...shownCards(output), ...listCards(turn.response)]
  if (cards.length > 1) return { pass: false, reason: 'The question turn shows more than one card.' }
  const [card] = cards
  const recordId = pickedRecord(answer.pick, records)
  const selection = card?.kind === 'pickList' ? pickOnList(card, turn.trace, recordId, locale)
    : card ? pickOnCard(card, turn.trace, recordId, locale) : null
  if (selection?.limit) {
    return { pass: false, graderLimit: true, reason: 'The grader cannot tell which record each row of the list card stands for.' }
  }
  return { pass: true, ...(selection ?? { message: answer.text[locale] }) }
}
