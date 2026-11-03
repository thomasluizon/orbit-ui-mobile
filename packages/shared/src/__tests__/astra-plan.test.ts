import { describe, expect, it, vi } from 'vitest'
import { createStore } from 'zustand/vanilla'
import { astraPlanSchema } from '../types/astra-plan'
import { chatResponseSchema } from '../types/chat'
import { conversationPageSchema } from '../types/conversation'
import { createChatStoreState } from '../stores/chat-store'
import { consumeChatSseStream, createChatSseParser } from '../chat/sse-stream'
import { applyChatPlan, planStepStatus, planStepStatusKey, reconcileChatPlanApproval, updateMessagePlanStep } from '../chat/astra-plan'
import { buildChatFinalMessageFields } from '../chat/final-message'
import { restoreConversationPage } from '../chat/conversation-history'
import { makeAstraPlan, makeApprovalPlan, planOperationId } from '../test-support/astra-plan-fixtures'
import { makeConversationPage } from '../test-support/conversation-fixtures'

const frame = (event: unknown) => `data: ${JSON.stringify(event)}\n\n`
const makeMessage = () => ({ id: 'reply', role: 'ai' as const, content: '', timestamp: new Date(), plan: makeAstraPlan() })

describe('Astra plan contract and transitions', () => {
  it.each(['pending', 'running', 'done', 'failed', 'skipped', 'future'])('retains the API %s status and maps its presentation', status => {
    const plan = makeAstraPlan()
    plan.steps[0]!.status = status
    expect(astraPlanSchema.parse(plan)).toEqual(plan)
    expect(planStepStatus(status)).toBe(status === 'future' ? 'pending' : status)
    expect(planStepStatusKey(status)).toBe({ pending: 'chat.habitList.pending', running: 'blockFrame.status.acting', done: 'blockFrame.status.done', failed: 'blockFrame.status.failed', skipped: 'habits.statusDot.skip', future: 'chat.habitList.pending' }[status])
  })

  it('replaces bound steps by plan and step identity without inserting unknown steps', () => {
    const message = makeMessage()
    const step = { ...message.plan.steps[1]!, status: 'running', toolCallId: 'call-2' }
    expect(updateMessagePlanStep(message, 'different-plan', step)).toBe(message)
    expect(updateMessagePlanStep(message, message.plan.id, { ...step, id: 'unknown' })).toBe(message)
    const updated = updateMessagePlanStep(message, message.plan.id, step)
    expect(updated.plan?.steps).toEqual([message.plan.steps[0], step])
    expect(updated.id).toBe(message.id)
  })

  it('dispatches fragmented live events before the final response and keeps concurrent completions', async () => {
    let message = makeMessage()
    const onPlan = vi.fn()
    const plan = makeAstraPlan()
    async function* chunks() {
      const encoded = frame({ type: 'plan', plan })
      yield encoded.slice(0, 30)
      yield encoded.slice(30)
      expect(onPlan).toHaveBeenCalledWith(plan)
      yield frame({ type: 'plan_step', planId: plan.id, planStep: { ...plan.steps[1], status: 'done', toolCallId: 'call-2' } })
      expect(message.plan.steps.map(step => step.status)).toEqual(['pending', 'done'])
      yield frame({ type: 'plan_step', planId: plan.id, planStep: { ...plan.steps[0], status: 'done', toolCallId: 'call-1' } })
      yield frame({ type: 'final', response: { actions: [], plan: message.plan } })
    }
    const outcome = await consumeChatSseStream(chunks(), {
      onDelta: vi.fn(), onReset: vi.fn(), onPlan,
      onPlanStep: (id, step) => { message = updateMessagePlanStep(message, id, step) as typeof message },
    })
    expect(outcome).toMatchObject({ kind: 'final', response: { plan: { steps: [{ status: 'done' }, { status: 'done' }] } } })
    expect(createChatSseParser().feed(frame({ type: 'plan_step', planId: 'invalid', planStep: plan.steps[0] }))).toEqual([])
  })

  it('keeps plans optional for old responses and restores final plans from JSON or the typed turn', () => {
    expect(chatResponseSchema.parse({ actions: [] }).plan).toBeUndefined()
    const plan = makeAstraPlan()
    plan.steps.forEach(step => { step.status = 'done' })
    expect(buildChatFinalMessageFields(chatResponseSchema.parse({ actions: [], plan }), []).plan).toEqual(plan)
    const page = makeConversationPage()
    page.turns[1]!.responseJson = JSON.stringify({ actions: [], plan })
    expect(restoreConversationPage(conversationPageSchema.parse(page))[1]?.plan).toEqual(plan)
    page.turns[1]!.responseJson = null
    page.turns[1]!.plan = plan
    expect(restoreConversationPage(conversationPageSchema.parse(page))[1]?.plan).toEqual(plan)
  })

  it('applies authoritative updates to their original reply only', () => {
    const store = createStore(createChatStoreState)
    const original = { ...makeMessage(), plan: makeApprovalPlan() }
    store.setState({ messages: [original, { ...makeMessage(), id: 'unrelated', plan: { ...makeAstraPlan(), id: '00000000-0000-4000-8000-000000000001' } }] })
    const updated = makeApprovalPlan('skipped')
    applyChatPlan(store.getState(), updated)
    expect(store.getState().messages[0]?.plan).toEqual(updated)
    expect(store.getState().messages[1]?.plan?.steps[0]?.status).toBe('pending')
  })

  it.each(['running', 'done', 'failed', 'skipped'] as const)('reconciles %s approval without recording and preserves execution rows', status => {
    const store = createStore(createChatStoreState)
    store.setState({ messages: [{ ...makeMessage(), plan: makeApprovalPlan() }] })
    reconcileChatPlanApproval(store.getState(), 'unrelated', status, null)
    expect(store.getState().messages[0]?.plan?.steps[1]?.status).toBe('pending')
    reconcileChatPlanApproval(store.getState(), planOperationId, status, undefined)
    expect(store.getState().messages[0]?.plan?.steps.map(step => step.status)).toEqual(['done', status])
    reconcileChatPlanApproval(store.getState(), planOperationId, 'done', makeApprovalPlan('failed'))
    expect(store.getState().messages[0]?.plan?.steps[1]?.status).toBe('failed')
  })
})
