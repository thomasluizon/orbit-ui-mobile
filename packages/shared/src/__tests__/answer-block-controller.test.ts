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
  it.each(['choice', 'pickList'] as const)('keeps an identical %s recovery reachable after a limit refresh', async kind => {
    const send = vi.fn().mockResolvedValueOnce({ ok: false, status: null }).mockResolvedValueOnce({ ok: true })
    const input: AnswerBlockProps = { ...props({ send }), definition: kind === 'choice'
      ? { kind, block: { ...choiceBlockFixture, multiSelect: true } }
      : { kind, block: pickListBlockFixture } }
    const controller = new AnswerBlockController(input)
    const ids = kind === 'choice' ? ['morning', 'evening'] : ['1', '3']
    ids.forEach(id => controller.check(id, true))
    controller.setFreeText('After work')
    await controller.submit(input, t, 'en')
    const refreshed = { ...input, interaction: { ...input.interaction!, atMessageLimit: true } }
    expect(getAnswerBlockView(refreshed, controller.getSnapshot(), t).submitDisabled).toBe(false)
    expect(getAnswerBlockView(refreshed, controller.getSnapshot(), t).status).toBe('error')
    await controller.submit(refreshed, t, 'en')
    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls[1]).toEqual(send.mock.calls[0])
  })

  it.each(['selection', 'order', 'free text', 'block'] as const)('gates a changed %s at the limit and preserves the uncertain snapshot', async change => {
    const input = { ...props({ send: vi.fn(async () => ({ ok: false as const, status: null })) }),
      definition: { kind: 'choice' as const, block: { ...choiceBlockFixture, multiSelect: true } } }
    const controller = new AnswerBlockController(input)
    controller.check('morning', true)
    controller.check('evening', true)
    controller.setFreeText('After work')
    await controller.submit(input, t, 'en')
    let refreshed = { ...input, interaction: { ...input.interaction!, atMessageLimit: true } }
    if (change === 'selection') controller.check('evening', false)
    if (change === 'order') { controller.check('morning', false); controller.check('morning', true) }
    if (change === 'free text') controller.setFreeText('Before work')
    if (change === 'block') refreshed = { ...refreshed, definition: { ...refreshed.definition, block: { ...choiceBlockFixture, multiSelect: true, blockId: 'another-block' } } }
    expect(getAnswerBlockView(refreshed, controller.getSnapshot(), t)).toMatchObject({ submitDisabled: true, status: 'limit' })
    await controller.submit(refreshed, t, 'en')
    expect(input.interaction!.send).toHaveBeenCalledTimes(1)
    controller.check('morning', false)
    controller.check('evening', false)
    controller.check('morning', true)
    controller.check('evening', true)
    controller.setFreeText('After work')
    expect(getAnswerBlockView({ ...refreshed, definition: input.definition }, controller.getSnapshot(), t).submitDisabled).toBe(false)
  })

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
      expect(getAnswerBlockView({ ...input, interaction: { ...input.interaction!, atMessageLimit: true } }, controller.getSnapshot(), t)).toMatchObject({ status: status === 400 ? 'invalid' : 'error', statusError: true, submitDisabled: false })
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

  it('closes a choice at once, calls the request once and gives the composer the focus', async () => {
    const close = vi.fn(async (): Promise<BlockAnswerResult> => ({ ok: true }))
    const input = props({ close })
    const controller = new AnswerBlockController(input)
    const pending = controller.close(input, t)
    expect(getAnswerBlockView(input, controller.getSnapshot(), t)).toMatchObject({ closed: 'closed', answered: false, closeDisabled: true })
    expect(controller.focusWhenClosed).toBe(false)
    await pending
    await controller.close(input, t)
    expect(close).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledWith(choiceBlockFixture.blockId)
    expect(input.interaction!.send).not.toHaveBeenCalled()
  })

  it.each([{ status: 500 }, { throws: true }])('reopens a failed close with the answers kept and the error %o', async failure => {
    const input = props({ close: async () => { if ('throws' in failure) throw new Error('offline'); return { ok: false, status: failure.status! } } })
    const controller = new AnswerBlockController(input)
    controller.select('morning')
    await controller.close(input, t)
    expect(getAnswerBlockView(input, controller.getSnapshot(), t)).toMatchObject({ closed: null, status: 'error', statusError: true })
    expect(controller.getSnapshot().selectedIds).toEqual(['morning'])
    expect(controller.focusWhenClosed).toBe(true)
  })

  it('settles an already answered choice with its own line', async () => {
    const input = props({ close: async () => ({ ok: false, status: 409 }) })
    const controller = new AnswerBlockController(input)
    await controller.close(input, t)
    expect(getAnswerBlockView(input, controller.getSnapshot(), t).closed).toBe('alreadyAnswered')
  })

  it('renders a choice that carries closedAtUtc closed and without terminal focus', () => {
    const input = { ...props({ close: async () => ({ ok: true }) }), definition: { kind: 'choice' as const, block: { ...choiceBlockFixture, closedAtUtc: '2026-11-27T10:00:00Z' } } }
    expect(getAnswerBlockView(input, new AnswerBlockController(input).getSnapshot(), t)).toMatchObject({ closed: 'closed', closeDisabled: true })
    expect(new AnswerBlockController(input).focusWhenClosed).toBe(false)
  })

  it('disables the close offline, while acting, for a pick list and without a close request', () => {
    const open = props({ close: async () => ({ ok: true }) })
    const state = new AnswerBlockController(open).getSnapshot()
    expect(getAnswerBlockView(open, state, t)).toMatchObject({ closable: true, closeDisabled: false })
    expect(getAnswerBlockView({ ...open, interaction: { ...open.interaction!, isOnline: false } }, state, t).closeDisabled).toBe(true)
    expect(getAnswerBlockView(open, { ...state, acting: true }, t).closeDisabled).toBe(true)
    expect(getAnswerBlockView(props(), state, t)).toMatchObject({ closable: false, closeDisabled: true })
    expect(getAnswerBlockView({ ...open, definition: { kind: 'pickList', block: pickListBlockFixture } }, state, t)).toMatchObject({ closable: false, closeDisabled: true })
  })
})
