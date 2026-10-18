import { describe, expect, it, vi } from 'vitest'
import { AnswerBlockController, getAnswerBlockView, type AnswerTranslator } from '../chat/answer-block-controller'
import type { AnswerBlockProps, BlockAnswerInteraction, BlockAnswerResult } from '../chat/block-answer'
import { choiceBlockFixture, pickListBlockFixture } from '../test-support/choice-fixtures'

const t: AnswerTranslator = (key, values) => key === 'answered' ? `You chose ${values?.options}` : key
function props(overrides: Partial<BlockAnswerInteraction> = {}): AnswerBlockProps {
  return { definition: { kind: 'choice', block: choiceBlockFixture }, interaction: {
    isOnline: true, isSending: false, atMessageLimit: false, allowance: 5,
    send: vi.fn(async (): Promise<BlockAnswerResult> => ({ ok: true })), ...overrides,
  } }
}

describe('shared answer controller', () => {
  it('submits one snapshot, rejects duplicate presses and notifies subscribers', async () => {
    let finish!: (result: BlockAnswerResult) => void
    const send = vi.fn(() => new Promise<BlockAnswerResult>(resolve => { finish = resolve }))
    const input = props({ send })
    const controller = new AnswerBlockController(input)
    const listener = vi.fn()
    const unsubscribe = controller.subscribe(listener)
    controller.select('morning')
    controller.setFreeText(' Outra hora ')
    const first = controller.submit(input, t, 'pt-BR')
    await controller.submit(input, t, 'pt-BR')
    expect(send).toHaveBeenCalledExactlyOnceWith({ kind: 'choice', labels: [choiceBlockFixture.options[0]!.label],
      answer: { blockId: choiceBlockFixture.blockId, selectedIds: ['morning'], freeText: 'Outra hora' } })
    const view = getAnswerBlockView(input, controller.getSnapshot(), t)
    expect(view).toMatchObject({ acting: true, disabled: true, submitDisabled: true, status: 'acting', statusError: false })
    finish({ ok: true })
    await first
    expect(controller.getSnapshot()).toMatchObject({ acting: false, settled: {
      text: `You chose ${choiceBlockFixture.options[0]!.label} e Outra hora`, answered: true,
    } })
    expect(listener).toHaveBeenCalled()
    unsubscribe()
    listener.mockClear()
    controller.setFreeText('later')
    expect(listener).not.toHaveBeenCalled()
  })

  it.each([404, 409, 410, 400, 500, null])('handles status %s without losing the selected answer', async status => {
    const input = props({ send: vi.fn(async () => ({ ok: false, status })) })
    const controller = new AnswerBlockController(input)
    controller.select('evening')
    await controller.submit(input, t, 'en')
    const view = getAnswerBlockView(input, controller.getSnapshot(), t)
    expect(controller.getSnapshot().selectedIds).toEqual(['evening'])
    if (status === 404 || status === 409 || status === 410) {
      expect(view).toMatchObject({ closed: status === 409 ? 'alreadyAnswered' : 'closed', answered: false })
    } else {
      expect(view).toMatchObject({ closed: null, status: status === 400 ? 'invalid' : 'error', statusError: true, submitDisabled: false })
      expect(getAnswerBlockView({ ...input, interaction: { ...input.interaction!, isOnline: false } }, controller.getSnapshot(), t)).toMatchObject({ status: 'offline', statusError: false, submitDisabled: true })
      expect(getAnswerBlockView({ ...input, interaction: { ...input.interaction!, atMessageLimit: true } }, controller.getSnapshot(), t)).toMatchObject({ status: 'limit', statusError: false, submitDisabled: true })
    }
  })

  it('keeps selection and expansion independent when a request throws, then permits retry', async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error('stream failed')).mockResolvedValueOnce({ ok: true })
    const input: AnswerBlockProps = { ...props({ send, atMessageLimit: true }), definition: { kind: 'pickList', block: pickListBlockFixture } }
    const controller = new AnswerBlockController(input)
    controller.toggleExpanded('1')
    expect(controller.getSnapshot().selectedIds).toEqual([])
    controller.check('1', true)
    controller.check('2', true)
    controller.check('2', false)
    expect(getAnswerBlockView(input, controller.getSnapshot(), t)).toMatchObject({ submitDisabled: false, freeTextLabel: null, single: false })
    await controller.submit(input, t, 'en')
    expect(controller.getSnapshot()).toMatchObject({ selectedIds: ['1'], expandedIds: ['1'], error: 'error', acting: false })
    controller.toggleExpanded('1')
    expect(controller.getSnapshot().expandedIds).toEqual([])
    await controller.submit(input, t, 'en')
    expect(send).toHaveBeenCalledTimes(2)
    expect(controller.getSnapshot().settled?.answered).toBe(true)
  })

  it.each(['offline', 'sending', 'limit', 'empty', 'missing'] as const)('does not send while %s', async reason => {
    const input = props({ isOnline: reason !== 'offline', isSending: reason === 'sending', atMessageLimit: reason === 'limit' })
    const send = input.interaction!.send
    const activeInput = reason === 'missing' ? { ...input, interaction: undefined } : input
    const controller = new AnswerBlockController(activeInput)
    if (reason !== 'empty') controller.select('morning')
    await controller.submit(activeInput, t, 'en')
    expect(send).not.toHaveBeenCalled()
    expect(getAnswerBlockView(activeInput, controller.getSnapshot(), t).submitDisabled).toBe(true)
  })

  it('uses the saved answer ahead of expiry and retains initial terminal focus policy', () => {
    const input = props()
    const controller = new AnswerBlockController(input)
    expect(controller.focusWhenClosed).toBe(true)
    expect(getAnswerBlockView({ ...input, expired: true }, controller.getSnapshot(), t).closed).toBe('closed')
    const saved = { ...input, expired: true, savedAnswer: { text: 'saved', answered: true } }
    expect(getAnswerBlockView(saved, controller.getSnapshot(), t)).toMatchObject({ closed: 'saved', answered: true })
    expect(new AnswerBlockController(saved).focusWhenClosed).toBe(false)
  })
})
