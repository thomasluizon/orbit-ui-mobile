import { describe, expect, it, vi } from 'vitest'
import { questionBlockSchema, questionSliderTick, questionSliderValue, questionSliderValueAtTick } from '../types/question-block'
import { blockAnswerSchema, chatPartSchema } from '../types/chat'
import type { BlockAnswerInteraction } from '../chat/block-answer'
import { isSameBlockAnswer } from '../chat/block-answer'
import { QuestionBlockController, formatQuestionNumber, isQuestionAnswered, questionAnswerLabels, questionBlockStatus, type QuestionWords } from '../chat/question-block-core'
import { questionBlockFixture as block, questionAnswersFixture as answers } from '../test-support/question-fixtures'

const words: QuestionWords = { yes: 'Yes', no: 'No', answered: options => `You chose ${options}`, closed: 'Closed', alreadyAnswered: 'Answered', invalid: 'Invalid', error: 'Error', offline: 'Offline', limit: 'Limit', acting: 'Sending' }
const interaction = () => ({ isOnline: true, isSending: false, atMessageLimit: false, allowance: 5, send: vi.fn<BlockAnswerInteraction['send']>(async () => ({ ok: true as const })) })
function complete(controller: QuestionBlockController) { block.questions.forEach((question, index) => controller.setAnswer(question, answers[index]!)) }

describe('question block contract and state', () => {
  it('retains a question part at the chat boundary', () => {
    const part = { type: 'block', kind: 'question', block }
    expect(chatPartSchema.parse(part)).toEqual(part)
  })
  it.each(block.questions.map((question, index) => ({ question, answer: answers[index]! })))('validates the $question.type answer and rejects a missing value', ({ question, answer }) => {
    expect(isQuestionAnswered(question, answer)).toBe(true)
    expect(isQuestionAnswered(question, { questionId: question.id })).toBe(false)
  })
  it('requires every question, including false and zero as valid answers, and sends one structured turn', async () => {
    const controller = new QuestionBlockController()
    const props = { block, interaction: interaction() }
    await controller.submit(props, words, 'en')
    expect(controller.getSnapshot().invalidIds).toEqual(block.questions.map(question => question.id))
    expect(props.interaction.send).not.toHaveBeenCalled()
    complete(controller)
    expect(questionBlockStatus(props, controller.getSnapshot(), words).completed).toBe(5)
    await controller.submit(props, words, 'en')
    const request = props.interaction.send.mock.calls[0]![0]
    expect(request).toMatchObject({ kind: 'question', answer: { blockId: block.blockId, selectedIds: [], answers } })
    expect(blockAnswerSchema.parse(JSON.parse(JSON.stringify(request.answer)))).toEqual(request.answer)
    expect(request.labels).toEqual(['When?: Morning', 'Which activities?: Walking, Reading, and Swimming', 'How much energy?: 3', 'How long?: 0 hours', 'Add a reminder?: No'])
    controller.select(block.questions[0]!, 'evening')
    await controller.submit(props, words, 'en')
    expect(props.interaction.send).toHaveBeenCalledTimes(1)
  })
  it('uses custom text exclusively for single choice and yes/no, and alongside multiple choices', () => {
    const controller = new QuestionBlockController()
    complete(controller)
    for (const question of [block.questions[0]!, block.questions[1]!, block.questions[4]!]) controller.setFreeText(question, 'Custom answer ')
    expect(controller.getSnapshot().answers.time).toEqual({ questionId: 'time', freeText: 'Custom answer ' })
    expect(controller.getSnapshot().answers.reminder).toEqual({ questionId: 'reminder', freeText: 'Custom answer ' })
    expect(controller.getSnapshot().answers.activities?.selectedIds).toEqual(['walk', 'read'])
    controller.select(block.questions[0]!, 'morning')
    expect(controller.getSnapshot().answers.time?.freeText).toBeUndefined()
  })
  it('rejects cross-type values, unknown options, duplicate selections, and off-step numbers', () => {
    const invalid = [{ ...answers[0]!, number: 1 }, { ...answers[1]!, selectedIds: ['unknown'] }, { ...answers[2]!, number: 2.5 }, { ...answers[3]!, number: 0.05 }, { ...answers[4]!, freeText: 'Both' }]
    block.questions.forEach((question, index) => expect(isQuestionAnswered(question, invalid[index]!)).toBe(false))
    expect(isQuestionAnswered(block.questions[1]!, { questionId: 'activities', selectedIds: ['walk', 'walk'] })).toBe(false)
  })
  it('retains a slider whose decimal span equals its step through the chat parser', () => {
    const part = { type: 'block', kind: 'question', block: { ...block, questions: [{ ...block.questions[3]!, min: 0.1, max: 0.3, step: 0.2 }] } }
    expect(chatPartSchema.parse(part)).toEqual(part)
    expect(questionSliderValue(0.1, 0.3, 0.2, 1)).toBeCloseTo(0.3)
  })
  it('snaps fractional slider positions to decimal steps from a negative minimum', () => {
    expect(Array.from({ length: 7 }, (_, index) => questionSliderValue(-0.3, 0.3, 0.1, index / 6))).toEqual([-0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3])
  })
  it.each([
    { min: 0.05, max: 0.25, step: 0.1, values: [0.05, 0.15, 0.25] },
    { min: -0.15, max: 0.05, step: 0.1, values: [-0.15, -0.05, 0.05] },
    { min: 1e-8, max: 3e-8, step: 1e-8, values: [1e-8, 2e-8, 3e-8] },
  ])('round trips exact tick indices for a slider starting at $min', ({ min, max, step, values }) => {
    const ticks = questionSliderTick(max, min, step)
    expect(ticks).toBe(values.length - 1)
    values.forEach((value, tick) => {
      expect(questionSliderTick(value, min, step)).toBe(tick)
      expect(questionSliderValueAtTick(min, step, tick)).toBe(value)
      expect(questionSliderValue(min, max, step, tick / ticks)).toBe(value)
    })
  })
  it('shares localized decimal formatting with answer labels', () => {
    const supplied = questionBlockSchema.parse({ ...block, questions: [{ ...block.questions[3], min: 0.05, max: 0.25, step: 0.1 }] })
    expect(formatQuestionNumber(0.15, 'pt-BR')).toBe('0,15')
    expect(formatQuestionNumber(0.00000001, 'pt-BR')).toBe('0,00000001')
    expect(questionAnswerLabels(supplied, { duration: { questionId: 'duration', number: 0.15 } }, words, 'pt-BR')).toEqual(['How long?: 0,15 hours'])
  })
  it('retains typed answers through failures and enables only identical recovery at the limit', async () => {
    const controller = new QuestionBlockController()
    complete(controller)
    const props = { block, interaction: { ...interaction(), send: vi.fn(async () => ({ ok: false as const, status: 500 })) } }
    await controller.submit(props, words, 'en')
    props.interaction.atMessageLimit = true
    expect(questionBlockStatus(props, controller.getSnapshot(), words).submitDisabled).toBe(false)
    controller.setAnswer(block.questions[4]!, { boolean: true })
    expect(questionBlockStatus(props, controller.getSnapshot(), words).submitDisabled).toBe(true)
    expect(controller.getSnapshot().error).toBe('Error')
  })
  it.each([404, 409, 410])('locks terminal status %s and keeps saved or expired blocks closed', async status => {
    const controller = new QuestionBlockController()
    complete(controller)
    const props = { block, interaction: { ...interaction(), send: vi.fn(async () => ({ ok: false as const, status })) } }
    await controller.submit(props, words, 'en')
    expect(questionBlockStatus(props, controller.getSnapshot(), words).closed).toBe(status === 409 ? 'Answered' : 'Closed')
    expect(questionBlockStatus({ ...props, savedAnswer: { text: 'Saved', answered: true } }, controller.getSnapshot(), words).closed).toBe('Saved')
    const fresh = new QuestionBlockController()
    await fresh.submit({ ...props, expired: true }, words, 'en')
    expect(props.interaction.send).toHaveBeenCalledTimes(1)
  })
  it('compares all typed values while ignoring question and selection order for recovery', () => {
    const answer = { blockId: block.blockId, selectedIds: [], answers }
    expect(isSameBlockAnswer(answer, { ...answer, answers: [...answers].reverse().map(value => ({ ...value, ...('selectedIds' in value ? { selectedIds: [...(value.selectedIds ?? [])].reverse() } : {}) })) })).toBe(true)
    expect(isSameBlockAnswer(answer, { ...answer, answers: answers.map(value => value.questionId === 'reminder' ? { ...value, boolean: true } : value) })).toBe(false)
  })
  it('rejects malformed definitions and accepts omitted optional headings and recommendation', () => {
    expect(questionBlockSchema.safeParse({ ...block, title: undefined, intro: undefined, progress: undefined }).success).toBe(true)
    for (const questions of [[], [block.questions[0], block.questions[0]], [{ ...block.questions[2], options: [] }], [{ ...block.questions[3], step: 0.4 }], [{ ...block.questions[1], options: [{ id: 'a', label: 'A', recommended: true }, { id: 'b', label: 'B' }] }]]) {
      expect(questionBlockSchema.safeParse({ ...block, questions }).success).toBe(false)
    }
  })
})
