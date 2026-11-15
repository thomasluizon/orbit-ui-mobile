import { tsImport } from 'tsx/esm/api'
import { optionTargets, questionAnswer, sameTitleCard, selectionLists, shownCards } from '../same-title-card.mjs'

const { formatBlockAnswer } = await tsImport('../../../packages/shared/src/chat/block-answer.ts', import.meta.url)

const pickedRecord = (pick, records) => typeof pick === 'string' ? records[pick] : records[pick.of][pick.position]

// Producer: the shared pickListBlockSchema gives a list card one of three actions, and orbit-api
// AiBlockAnswerService.BuildPickListResponseAsync previews the bulk write of that action for the picked rows. So a
// list card can hold changes of one kind only.
const listCardKind = { create_habits: 'create', log_habits: 'log', skip_habits: 'skip' }
const textOf = (response) => [response.aiMessage, ...(response.parts ?? []).filter((part) => part?.type === 'text').map((part) => part.text)]
  .filter(Boolean).join(' ')

// What a reply without a preview is, for a request that changes the account. It is a question when it shows a choice or
// question card, a list card whose action can hold each change of the request, or a text that asks. A list card of
// another action cannot hold the request, and a reply that asks nothing leaves the person without a preview; both fail
// the case, and the person does not answer them.
export function questionOf(turn, expected) {
  const needed = [...new Set(expected.changes.map((change) => change.kind))]
  const lists = (turn.response.parts ?? []).filter((part) => part?.type === 'block' && part.kind === 'pickList')
  const unfit = lists.find((part) => needed.some((kind) => kind !== listCardKind[part.block.action]))
  if (unfit) {
    return { pass: false, reason: `The reply shows a list card that can only ${listCardKind[unfit.block.action]} habits; the request needs ${needed.join(' and ')}.` }
  }
  const asks = lists.length || shownCards({ composition: turn.response }).length || /[?？]/u.test(textOf(turn.response))
  return asks ? { pass: true } : { pass: false, reason: 'The reply holds no preview, no question card and no question.' }
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

// What the person does when the assistant asks: answer the choice or question card through blockAnswer when the card
// can hold the decision of the case, and type the decision when no such card can. The eval does not read which record
// a row of a list card stands for, so the person types the decision there too. A same-title card that cannot hold the
// decision fails the case, because the person cannot answer it.
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
  const cards = shownCards(output)
  if (cards.length > 1) return { pass: false, reason: 'The question turn shows more than one card.' }
  const selection = cards.length ? pickOnCard(cards[0], turn.trace, pickedRecord(answer.pick, records), locale) : null
  return { pass: true, ...(selection ?? { message: answer.text[locale] }) }
}
