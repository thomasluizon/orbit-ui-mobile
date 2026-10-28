import { describe, expect, it, vi } from 'vitest'
import { BlockAnswerSubmission, type ChatStreamResult } from '../chat/block-answer-submission'
import { createChatStoreState, type ChatStoreState } from '../stores/chat-store'
import { choiceBlockFixture, pickListBlockFixture } from '../test-support/choice-fixtures'
import type { BlockAnswerRequest } from '../chat/block-answer'
import allowanceRefusals from '../test-support/astra-allowance-refusals.fixture.json'

function submissionContext() {
  let chat: ChatStoreState = createChatStoreState(patch => {
    chat = { ...chat, ...(typeof patch === 'function' ? patch(chat) : patch) }
  })
  return {
    isOnline: true, atMessageLimit: false, locale: 'en',
    getChat: () => chat, createMessageId: () => 'answer-message',
    conversation: { astraConversationOpen: true, setAstraConversationOpen: vi.fn() },
    onDailyBudgetExceeded: vi.fn(), onAllowanceExceeded: vi.fn(),
    beginSend: vi.fn(), refreshProfile: vi.fn(async () => {}),
    run: vi.fn(async (_request: unknown, accepted: () => void): Promise<ChatStreamResult> => { accepted(); return { kind: 'final' } }),
    words: { answered: (content: string) => `You chose ${content}`, closed: 'closed', alreadyAnswered: 'already answered' },
  }
}

const choice: BlockAnswerRequest = {
  kind: 'choice', answer: { blockId: choiceBlockFixture.blockId, selectedIds: ['morning', 'evening'], freeText: 'After work' }, labels: ['Morning', 'Evening'],
}

describe('shared block answer submission', () => {
  it.each(allowanceRefusals)('does not recover an answer refused by the $period allowance in $locale', async ({ body }) => {
    const context = submissionContext()
    context.run.mockResolvedValueOnce({ kind: 'failed', failure: { status: 403, error: body.error, code: body.errorCode }, draftMessageId: 'partial-reply' })
    const submission = new BlockAnswerSubmission()
    expect(await submission.send(choice, context)).toEqual({ ok: false, status: 403, allowanceReached: true })
    expect(context.onAllowanceExceeded).toHaveBeenCalledWith('partial-reply')
    expect(context.refreshProfile).toHaveBeenCalledOnce()
    expect(await submission.send(choice, { ...context, atMessageLimit: true })).toEqual({ ok: false, status: null })
    expect(context.run).toHaveBeenCalledOnce()
  })

  it.each(['choice', 'pickList'] as const)('does not recover a %s refused by the daily ceiling', async kind => {
    const context = submissionContext()
    context.run.mockResolvedValueOnce({ kind: 'failed', failure: { status: 400, error: 'Daily budget reached', code: 'AI_DAILY_BUDGET_EXCEEDED' }, draftMessageId: 'partial-reply' })
    const request = { ...choice, kind }
    const submission = new BlockAnswerSubmission()
    expect(await submission.send(request, context)).toEqual({ ok: false, status: 400, dailyBudgetReached: true })
    expect(context.onDailyBudgetExceeded).toHaveBeenCalledWith('partial-reply')
    expect(await submission.send(request, { ...context, dailyBudgetReached: true })).toEqual({ ok: false, status: null })
    expect(context.run).toHaveBeenCalledTimes(1)
    await submission.send(request, context)
    expect(context.run.mock.calls[1]?.[0]).toMatchObject({ messageCost: kind === 'choice' ? 1 : 0 })
    expect(context.refreshProfile).not.toHaveBeenCalled()
  })

  it('drops the prepared recovery request when the account changes', async () => {
    const context = submissionContext()
    context.run.mockResolvedValueOnce({ kind: 'failed', failure: { status: 500, error: 'Reply failed', code: null }, draftMessageId: null })
    const submission = new BlockAnswerSubmission()
    await submission.send(choice, context)
    submission.reset()
    expect(await submission.send(choice, { ...context, atMessageLimit: true })).toEqual({ ok: false, status: null })
    expect(context.run).toHaveBeenCalledTimes(1)
  })

  it.each(['choice', 'pickList'] as const)('reaches transport for an identical %s recovery at the limit and refreshes usage', async kind => {
    const context = submissionContext()
    const request = kind === 'choice' ? choice : { ...choice, kind, answer: { blockId: pickListBlockFixture.blockId, selectedIds: ['1', '3'] } }
    context.run.mockImplementationOnce(async (_request, accepted) => {
      accepted()
      return { kind: 'failed', failure: { status: null, error: 'Lost final', code: null }, draftMessageId: null }
    })
    const submission = new BlockAnswerSubmission()
    await submission.send(request, context)
    expect(await submission.send(request, { ...context, atMessageLimit: true })).toEqual({ ok: true })
    expect(context.run).toHaveBeenCalledTimes(2)
    expect(context.run.mock.calls.map(([attempt]) => attempt)).toEqual([
      expect.objectContaining({ blockAnswer: request.answer, messageCost: kind === 'choice' ? 1 : 0 }),
      expect.objectContaining({ blockAnswer: request.answer, messageCost: 0 }),
    ])
    expect(context.refreshProfile).toHaveBeenCalledOnce()
    expect(context.getChat().messages).toHaveLength(1)
  })

  it.each(['block', 'selection', 'order', 'free text'] as const)('blocks a changed %s at the limit and retains the original recovery', async change => {
    const context = submissionContext()
    context.run.mockResolvedValueOnce({ kind: 'cancelled' })
    const submission = new BlockAnswerSubmission()
    await submission.send(choice, context)
    const changed = { ...choice, answer: { ...choice.answer } }
    if (change === 'block') changed.answer.blockId = pickListBlockFixture.blockId
    if (change === 'selection') changed.answer.selectedIds = ['morning']
    if (change === 'order') changed.answer.selectedIds = ['evening', 'morning']
    if (change === 'free text') changed.answer.freeText = 'Before work'
    expect(await submission.send(changed, { ...context, atMessageLimit: true })).toEqual({ ok: false, status: null })
    expect(context.run).toHaveBeenCalledTimes(1)
    expect(await submission.send(choice, { ...context, atMessageLimit: true })).toEqual({ ok: true })
    expect(context.run).toHaveBeenCalledTimes(2)
  })

  it('keeps first choice accounting optimistic and lets a different answer reach ordinary conflict handling', async () => {
    const context = submissionContext()
    const submission = new BlockAnswerSubmission()
    context.run.mockResolvedValueOnce({ kind: 'failed', failure: { status: 500, error: 'Reply failed', code: null }, draftMessageId: null })
    await submission.send(choice, context)
    context.run.mockResolvedValueOnce({ kind: 'failed', failure: { status: 409, error: 'Already answered', code: 'AstraBlockAnswered' }, draftMessageId: null })
    expect(await submission.send({ ...choice, answer: { ...choice.answer, selectedIds: ['morning'] } }, context)).toEqual({ ok: false, status: 409 })
    expect(context.run.mock.calls.map(([attempt]) => attempt)).toEqual([
      expect.objectContaining({ messageCost: 1 }), expect.objectContaining({ messageCost: 1 }),
    ])
    expect(context.refreshProfile).not.toHaveBeenCalled()
  })
})
