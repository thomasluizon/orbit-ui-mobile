import { afterEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { tsImport } from 'tsx/esm/api'
import { sameTitleCard } from '../same-title-card.mjs'
import { resetFixture } from '../fixtures/reset.mjs'
import { sameTitleSet } from '../fixtures/names.mjs'
import { fixtureFetch } from './fixtures/public-api.mjs'
import { offlineCredentials } from './fixtures/credentials.mjs'
import { streams } from './fixtures/same-title-streams.mjs'

const { AnswerBlockController } = await tsImport('../../../packages/shared/src/chat/answer-block-controller.ts', import.meta.url)
const { QuestionBlockController } = await tsImport('../../../packages/shared/src/chat/question-block-core.ts', import.meta.url)
const { BlockAnswerSubmission } = await tsImport('../../../packages/shared/src/chat/block-answer-submission.ts', import.meta.url)

const ids = Array.from({ length: 6 }, (_, index) => `22222222-2222-4222-8222-22222222222${index}`)
const parent = { id: '33333333-3333-4333-8333-333333333333', title: 'Water' }
const baselineOf = (children) => ({ parent, children: children.map((id, position) => ({ id, title: 'Water - 710ml', position })) })
const client = { supportsParts: true, partKinds: ['choice', 'question'], locale: 'en' }
// What the core set hands the card grader (core/answers.mjs): the decision of the person, by position among the children.
const policyFor = (locale) => ({ sameTitleSet: { answer: { deleted: [4, 5], renamed: [0, 1, 2, 3],
  text: locale === 'en' ? 'Delete the last 2 and rename the first 4' : 'Exclui os 2 últimos e renomeia os 4 primeiros' } } })

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

// Real first-turn cards of the 13 November 2026 staging runs. A set option covers only the ids its ask call declares.
const cardVars = (children, locale = 'pt-BR') => ({ ...policyFor(locale),
  sameTitleBaseline: baselineOf(children), clientContext: { ...client, locale } })
const askTrace = (targets) => ({ calls: [{ id: 'ask', name: 'ask', resultStatus: 'Succeeded',
  arguments: { input: { form: 'choice', options: Object.entries(targets).map(([id, target_ids]) => ({ id, label: id, description: null, target_ids })) } } }] })
const shown = (card, trace = { calls: [] }) => ({ composition: { parts: [card] }, trace })
const run2Options = streams.run2.card.block.questions[0].options.map((option) => option.id)
const unstored = '9b610c68-0080-417a-80b1-a3f9c3fbc810'
const syntheticChildren = Array.from({ length: 6 }, (_, index) => `66666666-6666-4666-8666-66666666666${index}`)

it.each([
  ['run 2 names a record that is not a stored child', shown(streams.run2.card), [...run2Options.filter((id) => id !== unstored), syntheticChildren[5]],
    'A card option names a record that is not a stored same-title child.'],
  ['run 2 takes one record for a question about two', shown(streams.run2.card), run2Options, 'No selection the card allows states the whole decision.'],
  ['run 4 offers four of six records', shown(streams.run4.card, askTrace(Object.fromEntries(['habit1', 'habit2', 'habit3', 'habit4']
    .map((id, index) => [id, [syntheticChildren[index]]])))), syntheticChildren, 'The card lets the person select 4 of the 6 same-title children.'],
  ['run 4 without declared targets', shown(streams.run4.card), syntheticChildren, 'The card lets the person select 0 of the 6 same-title children.'],
  ['run 5 leaves the middle two unselectable', shown(streams.run5.card, askTrace({ first: streams.run5.children.slice(0, 2), last: streams.run5.children.slice(4) })),
    streams.run5.children, 'The card lets the person select 4 of the 6 same-title children.'],
  ['run 3 without declared targets', shown(streams.run3.card), streams.run3.children, 'The card lets the person select 0 of the 6 same-title children.'],
])('fails a card that cannot hold the answer: %s', (_name, output, children, reason) => {
  expect(sameTitleCard(output, cardVars(children))).toMatchObject({ pass: false, reason })
})

// Producer: the web and mobile question blocks pass t('common.yes') and t('common.no') of the shared catalog as the words.
const appWords = (locale) => {
  const { common } = JSON.parse(readFileSync(new URL(`../../../packages/shared/src/i18n/${locale}.json`, import.meta.url), 'utf8'))
  return { yes: common.yes, no: common.no, answered: String }
}

// The real client submission: the card's controller hands its labels and answer to BlockAnswerSubmission.send, whose
// request is the message and blockAnswer the chat endpoint receives. A yesNo question takes a boolean, as the
// question-controls row does with setAnswer; a choice question takes the ids it selects.
async function clientAnswer(part, selected, locale) {
  let posted
  const chat = { isTyping: false, streamingMessageId: null, messages: [] }
  const submission = new BlockAnswerSubmission()
  const context = { isOnline: true, atMessageLimit: false, locale, getChat: () => chat, createMessageId: () => 'answer', beginSend() {},
    conversation: { astraConversationOpen: true }, refreshProfile: async () => {}, words: { answered: String },
    run: async (request) => { posted = request; return { kind: 'final' } } }
  const interaction = { isOnline: true, isSending: false, atMessageLimit: false, allowance: 1, send: (request) => submission.send(request, context) }
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-13T05:00:00Z'))
  try {
    if (part.kind === 'choice') {
      const controller = new AnswerBlockController({ definition: part })
      for (const id of selected) controller.check(id, true)
      await controller.submit({ definition: part, interaction }, String, locale)
    } else {
      const controller = new QuestionBlockController()
      for (const question of part.block.questions) {
        if (question.type === 'yesNo') controller.setAnswer(question, { boolean: selected[question.id] })
        else for (const id of selected[question.id] ?? []) controller.select(question, id)
      }
      await controller.submit({ block: part.block, interaction }, appWords(locale), locale)
    }
  } finally { vi.useRealTimers() }
  return { message: posted.content, blockAnswer: posted.blockAnswer }
}
const sentBy = ({ message, blockAnswer }) => ({ message, blockAnswer })

it('answers a card that can hold the decision with the message and selection the client sends', async () => {
  const children = streams.run3.children
  const run3 = sameTitleCard(shown(streams.run3.card, askTrace({ setA: children.slice(0, 4), setB: children.slice(2), all6: children })), cardVars(children))
  const run3Sent = await clientAnswer(streams.run3.card, ['setA'], 'pt-BR')
  expect(run3Sent.message).toBe('Primeiros quatro')
  expect(run3.pass).toBe(true)
  expect(sentBy(run3)).toEqual(run3Sent)
  const records = (prompt) => ({ type: 'block', kind: 'question', block: { blockId: '77777777-7777-4777-8777-777777777777', questions: [{ id: 'pick',
    type: 'multipleChoice', prompt, allowFreeText: false, options: ids.map((id, index) => ({ id, label: `${index + 1}º` })) }] } })
  const deleteCard = records('Quais dois você quer excluir?')
  const deleteSent = await clientAnswer(deleteCard, { pick: ids.slice(4) }, 'pt-BR')
  expect(deleteSent.message).toBe('Quais dois você quer excluir?: 5º e 6º')
  const deletion = sameTitleCard(shown(deleteCard), cardVars(ids))
  expect(deletion.pass).toBe(true)
  expect(sentBy(deletion)).toEqual(deleteSent)
  const keepCard = records('Which four do you want to keep?')
  const keepSent = await clientAnswer(keepCard, { pick: ids.slice(0, 4) }, 'en')
  expect(keepSent.message).toBe('Which four do you want to keep?: 1º, 2º, 3º, and 4º')
  const keep = sameTitleCard(shown(keepCard), cardVars(ids, 'en'))
  expect(keep.pass).toBe(true)
  expect(sentBy(keep)).toEqual(keepSent)
  expect(sameTitleCard({ composition: { parts: [{ type: 'text', text: 'Which two should I delete?' }] }, trace: { calls: [] } }, cardVars(ids, 'en')))
    .toEqual(expect.objectContaining({ pass: true, message: 'Delete the last 2 and rename the first 4' }))
})

const choiceCard = (options, question = 'Which two do you want to delete?') => ({ type: 'block', kind: 'choice',
  block: { blockId: '88888888-8888-4888-8888-888888888888', question, options: options.map(({ id, label }) => ({ id, label, description: null })),
    multiSelect: false, allowFreeText: false, expiresAtUtc: '2026-11-14T04:33:04Z' } })

// Producer: AiChoiceSelection.TargetsOf (orbit-api 2f49ed78f) reads an option's target_ids first, and the option's own id
// only when the option declares none; so declared targets win over an id that is a stored child or another GUID.
it.each([
  ['a stored child', ids[4]],
  ['a GUID that is not a stored child', unstored],
])('resolves a set option whose id is %s by its declared target_ids, as the API does', async (_name, id) => {
  const card = choiceCard([{ id, label: 'Last two' }, { id: 'firstFour', label: 'First four' }])
  const answer = sameTitleCard(shown(card, askTrace({ [id]: ids.slice(4), firstFour: ids.slice(0, 4) })), cardVars(ids, 'en'))
  expect(answer).toMatchObject({ pass: true, reason: 'The card can hold the whole decision.' })
  expect(sentBy(answer)).toEqual(await clientAnswer(card, [id], 'en'))
})

it('gives an option whose id is the empty GUID and that declares no targets no record, as the API does', () => {
  const card = choiceCard([{ id: 'lastTwo', label: 'Last two' }, { id: 'firstFour', label: 'First four' },
    { id: '00000000-0000-0000-0000-000000000000', label: 'Other' }])
  expect(sameTitleCard(shown(card, askTrace({ lastTwo: ids.slice(4), firstFour: ids.slice(0, 4) })), cardVars(ids, 'en')))
    .toMatchObject({ pass: true, blockAnswer: { blockId: card.block.blockId, selectedIds: ['lastTwo'] } })
})

const questionCard = (children, prompt, type = 'multipleChoice') => ({ type: 'block', kind: 'question', block: { blockId: '77777777-7777-4777-8777-777777777777',
  expiresAtUtc: '2026-11-14T04:33:04Z', questions: [{ id: 'pick', type, prompt, allowFreeText: false,
    options: children.map((id, index) => ({ id, label: `${index + 1}st` })) }] } })
// A record card with a second question that is not a choice: orbit-api AskTool accepts yesNo, scale and slider questions.
const withQuestion = (card, question) => ({ ...card, block: { ...card.block,
  questions: [...card.block.questions, { id: 'second', allowFreeText: false, ...question }] } })

// A record card lets the person select either half of the decision, so the grader answers the half its question asks
// about: the action the question names, else the count it states. The production request's verb is "coloca".
it.each([
  ['an English rename verb and count', 'Which four should I change to Water - 1.18L?', 'en'],
  ['a Portuguese rename verb and count', 'Quais quatro eu coloco como Water - 1.18L?', 'pt-BR'],
  ['an English rename verb alone', 'Which ones should become Water - 1.18L?', 'en'],
  ['a Portuguese rename verb alone', 'Quais você quer trocar para Water - 1.18L?', 'pt-BR'],
  ['an English count alone', 'Which four of them?', 'en'],
  ['a Portuguese count alone', 'Quais quatro deles?', 'pt-BR'],
])('answers a record card whose question carries %s with the renamed half', async (_name, prompt, locale) => {
  const card = questionCard(ids, prompt)
  const answer = sameTitleCard(shown(card), cardVars(ids, locale))
  expect(answer).toMatchObject({ pass: true, reason: 'The card can hold the whole decision.' })
  expect(sentBy(answer)).toEqual(await clientAnswer(card, { pick: ids.slice(0, 4) }, locale))
})

it.each([
  ['names no action and no count', 'Which ones do you mean?', 'en'],
  ['names no action and no count', 'Quais deles?', 'pt-BR'],
  ['names an action that its count contradicts', 'Which four should I delete?', 'en'],
])('reports a grader limit, not a model fault, for a record card whose question %s', (_name, prompt, locale) => {
  expect(sameTitleCard(shown(questionCard(ids, prompt)), cardVars(ids, locale))).toEqual({ pass: false, score: 0,
    reason: `The grader cannot tell which action the card question asks about (delete or rename): ${prompt}` })
})

// Producer: orbit-api ProcessUserChatCommand.SelectionCard.cs CompleteRecordCard (38513551a). Over four records it sends one
// question block with no title and one `records` question, multipleChoice when the request names several members, with
// the model's prompt, one option per record (its id the record id, its label "<title> (<n> of <count>)" or "(<n>º de
// <count>)"), and the model's free-text setting.
const completedRecordsCard = (prompt, locale) => ({ type: 'block', kind: 'question', block: {
  blockId: '55555555-5555-4555-8555-555555555555', expiresAtUtc: '2026-11-16T20:00:00Z', questions: [{ id: 'records',
    type: 'multipleChoice', prompt, allowFreeText: true, options: ids.map((id, index) => ({ id,
      label: `Water - 710ml (${locale === 'en' ? `${index + 1} of 6` : `${index + 1}º de 6`})` })) }] } })
// The model's own question form: one multipleChoice question whose options are the records.
const modelRecordsCard = (prompt) => questionCard(ids, prompt)
// A choice card whose set options hold either half, as its ask call declares.
const setOptionsCard = (prompt) => ({ card: choiceCard([{ id: 'lastTwo', label: 'Last two' }, { id: 'firstFour', label: 'First four' },
  { id: 'middleTwo', label: 'Middle two' }], prompt), trace: askTrace({ lastTwo: ids.slice(4), firstFour: ids.slice(0, 4), middleTwo: ids.slice(2, 4) }) })
const deletedHalf = ids.slice(4)
const renamedHalf = ids.slice(0, 4)

// A question that names both actions asks for one selection, and the size of the selection tells its half, because the
// decision deletes two and renames four. The person selects the half of the action that the question asks first: the
// first action of its first question sentence. A count belongs to the action its clause names, so it only confirms that
// action. The prompts of the completed records card are the real prompts of the five baseline grader-limit cases.
it.each([
  ['the completed records card', 'en', 'Six found, not seven. Which two to delete and which four to rename?', deletedHalf],
  ['the completed records card', 'en', 'I found 6, not 7. Which 2 should I delete, leaving 4 to rename?', deletedHalf],
  ['the completed records card', 'en', 'Which two entries should I delete, and which four should I rename?', deletedHalf],
  ['the completed records card', 'pt-BR', 'Quais dois dos seis você quer apagar e quais quatro renomear para Water - 1.18L?', deletedHalf],
  ['the completed records card', 'pt-BR', 'Quais dois hábitos “Water - 710ml” você quer apagar? Também diga quais quatro renomear para “Water - 1.18L”.', deletedHalf],
  ['the completed records card', 'pt-BR', 'Quais dois dos seis você quer remover? Os outros quatro serão renomeados para Water - 1.18L.', deletedHalf],
  ['the completed records card', 'en', 'Which four should I rename, and which two should I delete?', renamedHalf],
  ['the completed records card', 'en', 'Which ones should I delete, and which four should I rename?', deletedHalf],
  ['the completed records card', 'en', 'Which ones should I keep? The other two get deleted.', renamedHalf],
  ['the completed records card', 'en', 'The other two get deleted. Which ones should I keep?', renamedHalf],
  ['the completed records card', 'en', 'Which ones should I delete? The other four get renamed.', deletedHalf],
  ['the completed records card', 'en', 'The other four get renamed. Which ones should I delete?', deletedHalf],
  ['the completed records card', 'pt-BR', 'Quais eu mantenho? Os outros dois serão excluídos.', renamedHalf],
  ['the completed records card', 'pt-BR', 'Os outros dois serão excluídos. Quais eu mantenho?', renamedHalf],
  ['the model records card', 'pt-BR', streams.run3.card.block.question, deletedHalf],
  ['the model records card', 'pt-BR', 'Quais dois excluo? Diga por ordem quais quatro renomeio.', deletedHalf],
])('answers %s in %s whose question names both actions: %s', async (shape, locale, prompt, half) => {
  const card = shape === 'the completed records card' ? completedRecordsCard(prompt, locale) : modelRecordsCard(prompt)
  const answer = sameTitleCard(shown(card), cardVars(ids, locale))
  expect(answer).toMatchObject({ pass: true, reason: 'The card can hold the whole decision.' })
  expect(sentBy(answer)).toEqual(await clientAnswer(card, { [card.block.questions[0].id]: half }, locale))
})

it.each([
  ['en', 'Which two should I delete and which four should I rename?', 'lastTwo'],
  ['pt-BR', 'Quais quatro eu renomeio e quais dois eu apago?', 'firstFour'],
])('answers the set options card in %s whose question names both actions with the option of the half it names first', async (locale, prompt, option) => {
  const { card, trace } = setOptionsCard(prompt)
  const answer = sameTitleCard(shown(card, trace), cardVars(ids, locale))
  expect(answer).toMatchObject({ pass: true, reason: 'The card can hold the whole decision.' })
  expect(sentBy(answer)).toEqual(await clientAnswer(card, [option], locale))
})

// A count that its clause names with the other half's action contradicts the question, so the grader never guesses one.
it.each([
  ['en', 'Which ones should I keep? The other four get deleted.'],
  ['en', 'Which two should I keep, and which ones should I delete?'],
  ['pt-BR', 'Quais eu mantenho? Os outros quatro serão excluídos.'],
])('reports a grader limit for a %s question that names both actions and whose count its clause contradicts: %s', (locale, prompt) => {
  expect(sameTitleCard(shown(completedRecordsCard(prompt, locale)), cardVars(ids, locale))).toEqual({ pass: false, score: 0,
    reason: `The grader cannot tell which action the card question asks about (delete or rename): ${prompt}` })
})

// Halves of one size give a selection that names neither half, so the grader never guesses one.
it.each([
  ['the completed records card', (prompt) => ({ card: completedRecordsCard(prompt, 'en'), trace: { calls: [] } })],
  ['the model records card', (prompt) => ({ card: modelRecordsCard(prompt), trace: { calls: [] } })],
  ['the set options card', (prompt) => { const { card } = setOptionsCard(prompt)
    return { card, trace: askTrace({ lastTwo: ids.slice(3), firstFour: ids.slice(0, 3), middleTwo: ids.slice(2, 4) }) } }],
])('reports a grader limit for %s whose question names both actions when the halves have one size', (_shape, cardOf) => {
  const prompt = 'Which three should I delete and which three should I rename?'
  const { card, trace } = cardOf(prompt)
  const vars = cardVars(ids, 'en')
  vars.sameTitleSet.answer = { ...vars.sameTitleSet.answer, deleted: [3, 4, 5], renamed: [0, 1, 2] }
  expect(sameTitleCard(shown(card, trace), vars)).toEqual({ pass: false, score: 0,
    reason: `The grader cannot tell which action the card question asks about (delete or rename): ${prompt}` })
})

// The record list states one half and a yesNo question proposes the rename of the other half, so the card holds the whole
// decision. IsValidAnswer (orbit-api AiQuestions) needs one answer per question, so the yesNo question is answered too.
// A keep word beside a real rename verb still proposes the rename.
it.each([
  ['en', 'a rename verb', 'Which two should I delete?', 'Rename the other four to Water - 1.18L?',
    'Which two should I delete?: 5st and 6st and Rename the other four to Water - 1.18L?: Yes'],
  ['pt-BR', 'a rename verb', 'Quais dois eu excluo?', 'Renomeio os outros quatro para Water - 1.18L?',
    'Quais dois eu excluo?: 5st e 6st e Renomeio os outros quatro para Water - 1.18L?: Sim'],
  ['en', 'keep and a rename verb', 'Which two should I delete?', 'Keep the other four and rename them to Water - 1.18L?',
    'Which two should I delete?: 5st and 6st and Keep the other four and rename them to Water - 1.18L?: Yes'],
  ['pt-BR', 'manter and a rename verb', 'Quais dois eu excluo?', 'Mantenho os outros quatro e renomeio para Water - 1.18L?',
    'Quais dois eu excluo?: 5st e 6st e Mantenho os outros quatro e renomeio para Water - 1.18L?: Sim'],
])('answers a %s record card whose yes or no question proposes the other half with %s with yes, as the client sends it', async (locale, _name, prompt, confirm, message) => {
  const card = withQuestion(questionCard(ids, prompt), { type: 'yesNo', prompt: confirm })
  const sent = await clientAnswer(card, { pick: ids.slice(4), second: true }, locale)
  expect(sent.message).toBe(message)
  expect(sent.blockAnswer.answers).toEqual([{ questionId: 'pick', selectedIds: ids.slice(4) }, { questionId: 'second', boolean: true }])
  const answer = sameTitleCard(shown(card), cardVars(ids, locale))
  expect(answer).toMatchObject({ pass: true, reason: 'The card can hold the whole decision.' })
  expect(sentBy(answer)).toEqual(sent)
})

const cannotTell = 'The grader cannot tell which action the card question asks about (delete or rename)'
it.each([
  ['a yes or no question that names no action', { type: 'yesNo', prompt: 'Is that right?' }, 'en', cannotTell],
  ['a yes or no question that names no action', { type: 'yesNo', prompt: 'Está certo?' }, 'pt-BR', cannotTell],
  ['a yes or no question that names both actions', { type: 'yesNo', prompt: 'Delete those and rename the rest?' }, 'en', cannotTell],
  ['a yes or no question about the half the records state', { type: 'yesNo', prompt: 'Delete those two?' }, 'en',
    'The grader cannot answer a yes or no card question about the half the selection states'],
  // A count names the half, never the action: yes to a prompt of no change would tell the assistant not to rename the four.
  ['a yes or no question that leaves the other half as it is', { type: 'yesNo', prompt: 'Leave the other four as they are?' }, 'en', cannotTell],
  ['a yes or no question that keeps the other half unchanged', { type: 'yesNo', prompt: 'Should the other four stay unchanged?' }, 'en', cannotTell],
  ['a yes or no question that keeps the other half as it is', { type: 'yesNo', prompt: 'Os outros quatro ficam como estão?' }, 'pt-BR', cannotTell],
  ['a yes or no question whose only verb is keep', { type: 'yesNo', prompt: 'Keep the other four as they are?' }, 'en', cannotTell],
  ['a yes or no question whose only verb is manter', { type: 'yesNo', prompt: 'Mantenho os outros quatro como estão?' }, 'pt-BR', cannotTell],
  ['a yes or no question that names the title and no rename verb', { type: 'yesNo', prompt: 'Keep the title of the other four?' }, 'en', cannotTell],
  ['a yes or no question that negates the rename', { type: 'yesNo', prompt: "Don't rename the other four?" }, 'en', cannotTell],
  ['a yes or no question that negates the rename', { type: 'yesNo', prompt: 'Deixo os outros quatro sem renomear?' }, 'pt-BR', cannotTell],
  ['a yes or no question that offers the rename as one alternative', { type: 'yesNo', prompt: 'Rename the other four or leave them?' }, 'en', cannotTell],
  ['a yes or no question that offers the rename as one alternative', { type: 'yesNo', prompt: 'Renomeio os outros quatro ou deixo como estão?' }, 'pt-BR', cannotTell],
  ['a yes or no question whose count contradicts its verb', { type: 'yesNo', prompt: 'Rename the other two?' }, 'en', cannotTell],
  ['a scale question', { type: 'scale', prompt: 'How sure are you?', lowLabel: 'Unsure', highLabel: 'Sure' }, 'en',
    'The grader cannot answer a scale card question'],
  ['a slider question', { type: 'slider', prompt: 'Quantos ml?', min: 0, max: 2000, step: 10, unit: 'ml' }, 'pt-BR',
    'The grader cannot answer a slider card question'],
])('reports a grader limit, not a model fault, for a record card with %s', (_name, question, locale, limit) => {
  const card = withQuestion(questionCard(ids, 'Which two should I delete?'), question)
  expect(sameTitleCard(shown(card), cardVars(ids, locale))).toEqual({ pass: false, score: 0, reason: `${limit}: ${question.prompt}` })
})

// The model-fault wording stays for a card the grader reads in full: a single-choice record list cannot select two.
it.each([
  ['a readable yes or no question', { type: 'yesNo', prompt: 'Rename the other five?' }, 'No selection the card allows states the whole decision.'],
  ['a scale question', { type: 'scale', prompt: 'How sure are you?', lowLabel: 'Unsure', highLabel: 'Sure' },
    'The grader cannot answer a scale card question: How sure are you?'],
])('fails a single-choice record list beside %s by what the grader can read', (_name, question, reason) => {
  const card = withQuestion(questionCard(ids, 'Which one should I delete?', 'singleChoice'), question)
  expect(sameTitleCard(shown(card), cardVars(ids, 'en'))).toEqual({ pass: false, score: 0, reason })
})

it('answers a set-option card whose question names no action and no count with the one half its options state', async () => {
  const card = choiceCard([{ id: 'firstTwo', label: 'Delete the first two' }, { id: 'middleTwo', label: 'Delete the middle two' },
    { id: 'lastTwo', label: 'Delete the last two' }], 'What should I do?')
  const targets = { firstTwo: ids.slice(0, 2), middleTwo: ids.slice(2, 4), lastTwo: ids.slice(4) }
  const answer = sameTitleCard(shown(card, askTrace(targets)), cardVars(ids, 'en'))
  expect(answer).toMatchObject({ pass: true, reason: 'The card can hold the whole decision.' })
  expect(sentBy(answer)).toEqual(await clientAnswer(card, ['lastTwo'], 'en'))
})


let habits, requests
function boundary() {
  offlineCredentials()
  vi.stubEnv('ORBIT_EVAL_BASE_URL', 'https://orbit-api-staging-uqu2.onrender.com')
  vi.stubEnv('ORBIT_EVAL_TOKEN', 'pro-access')
  habits = []
  requests = []
  vi.stubGlobal('fetch', fixtureFetch(() => ({ habits, goals: [], tags: [], templates: [], requests, pro: true, exhausted: false, capacity: 100,
    email: 'thomaslrgregorio+orbit-eval-pro@gmail.com', unmetered: true })))
}

it('seeds one parent with six ordered same-title children and keeps both registered roots', async () => {
  boundary()
  const test = { metadata: { locale: 'en', fixture: 'same-title-children' }, vars: { credentialKey: 'ORBIT_EVAL_TOKEN' } }
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-24T12:00:00Z'))
  await resetFixture(test)
  vi.useRealTimers()
  const policy = { ...test.vars, evalRequestId: 'same-title', clientContext: client }
  const active = habits.filter((habit) => !habit.deleted)
  expect(active).toHaveLength(8)
  expect(active.filter((habit) => !habit.parentHabitId).map((habit) => habit.title).toSorted()).toEqual(['Walk', 'Water'])
  expect(policy.sameTitleBaseline.parent.title).toBe(sameTitleSet.parent)
  expect(policy.sameTitleBaseline.children.map(({ title, position }) => ({ title, position })))
    .toEqual(Array.from({ length: 6 }, (_, position) => ({ title: sameTitleSet.child, position })))
  expect(active.filter((habit) => habit.parentHabitId === policy.sameTitleBaseline.parent.id)).toHaveLength(6)
  expect(policy.fixtureEvidence.habits).toHaveLength(8)
  expect(requests.filter(({ method, path }) => method === 'DELETE' && path.startsWith('habits/'))).toEqual([])
  expect(requests.some(({ path }) => path.startsWith('chat') || path.startsWith('/api/ai/'))).toBe(false)
})
