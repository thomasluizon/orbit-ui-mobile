import { describe, expect, it, vi } from 'vitest'
import { createStore } from 'zustand/vanilla'
import { astraPlanSchema } from '../types/astra-plan'
import { agentExecuteOperationResponseSchema, pendingAgentOperationConfirmationSchema, pendingOperationRevisionResultSchema } from '../types/ai'
import { chatResponseSchema } from '../types/chat'
import { conversationPageSchema } from '../types/conversation'
import { createChatStoreState } from '../stores/chat-store'
import { consumeChatSseStream, createChatSseParser } from '../chat/sse-stream'
import { applyChatPlan, PlanAnnouncementTracker, planStepPresentation, planStepStatus, planStepStatusKey, reconcileChatPlanApproval, reconcileChatPlanExecution, reconcileChatPlanRevision, unplannedToolSteps, updateMessagePlanStep } from '../chat/astra-plan'
import { getChatReplyState } from '../chat/reply-state'
import { buildChatFinalMessageFields } from '../chat/final-message'
import { restoreConversationPage } from '../chat/conversation-history'
import { makeAstraPlan, makeApprovalPlan, planOperationId } from '../test-support/astra-plan-fixtures'
import { makeConversationPage } from '../test-support/conversation-fixtures'

const frame = (event: unknown) => `data: ${JSON.stringify(event)}\n\n`
const makeMessage = () => ({ id: 'reply', role: 'ai' as const, content: '', timestamp: new Date(), plan: makeAstraPlan() })

describe('Astra plan contract and transitions', () => {
  it('replaces activity with a supplied plan and retains unplanned tool traces', () => {
    const steps = [{ domain: 'habits', access: 'read' }]
    expect(unplannedToolSteps(makeAstraPlan(), steps)).toEqual([])
    expect(unplannedToolSteps(undefined, steps)).toBe(steps)
    expect(unplannedToolSteps(undefined, undefined)).toEqual([])
    expect(getChatReplyState({ isTyping: false, streamingMessageId: 'reply', activeStepCount: 0, atMessageLimit: false, hasPlan: true }))
      .toEqual({ showPendingReply: false, replyWorking: true })
  })
  it('announces each running step once without replaying restored or repeated updates', () => {
    const tracker = new PlanAnnouncementTracker()
    const message = makeMessage()
    message.plan.steps[0]!.status = 'running'
    expect(tracker.next([{ ...message, restored: true, plan: { ...message.plan, id: '00000000-0000-4000-8000-000000000001' } }], 'In progress')).toBeNull()
    expect(tracker.next([message], 'In progress')).toBe('Check habits: In progress')
    expect(tracker.next([message], 'In progress')).toBeNull()
    message.plan.steps[1]!.status = 'running'
    expect(tracker.next([message], 'In progress')).toBe('Check goals: In progress')
    message.plan.steps.forEach(step => { step.status = 'done' })
    expect(tracker.next([message], 'In progress')).toBeNull()
  })
  it('announces a new approval transition after restoring a pending plan without replaying saved running steps', () => {
    const tracker = new PlanAnnouncementTracker()
    const restored = { ...makeMessage(), restored: true, plan: makeApprovalPlan() }
    const running = { ...restored, id: 'other-reply', plan: { ...makeApprovalPlan('running'), id: '00000000-0000-4000-8000-000000000001' } }
    expect(tracker.next([running, restored], 'In progress')).toBeNull()
    expect(tracker.next([running, restored], 'In progress')).toBeNull()
    const approved = { ...restored, plan: makeApprovalPlan('running') }
    expect(tracker.next([running, approved], 'In progress')).toBe('Save habits: In progress')
    expect(tracker.next([running, approved], 'In progress')).toBeNull()
    expect(tracker.next([{ ...approved, plan: makeApprovalPlan('done') }], 'In progress')).toBeNull()
  })
  it.each(['pending', 'running', 'done', 'failed', 'skipped', 'future'])('retains the API %s status and maps its presentation', status => {
    const plan = makeAstraPlan()
    plan.steps[0]!.status = status
    expect(astraPlanSchema.parse(plan)).toEqual(plan)
    expect(planStepStatus(status)).toBe(status === 'future' ? 'pending' : status)
    expect(planStepStatusKey(status)).toBe({ pending: 'chat.habitList.pending', running: 'blockFrame.status.acting', done: 'blockFrame.status.done', failed: 'blockFrame.status.failed', skipped: 'habits.statusDot.skip', future: 'chat.habitList.pending' }[status])
  })

  it.each([
    ['pending', 'number', 'primary', false],
    ['running', 'working', 'primary', false],
    ['done', 'done', 'muted', true],
    ['failed', 'failed', 'failed', false],
    ['skipped', 'skipped', 'muted', false],
    ['future', 'number', 'primary', false],
  ] as const)('shares the %s step presentation across platforms', (status, markerKind, textRole, lineThrough) => {
    expect(planStepPresentation(status)).toEqual({ markerKind, textRole, lineThrough })
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

  it.each([undefined, null, makeApprovalPlan('running')])('preserves optional plans through confirmation and revision validation: %s', plan => {
    const confirmation = { pendingOperationId: planOperationId, confirmationToken: 'confirmation-token', expiresAtUtc: '2099-01-01T00:00:00Z', plan }
    expect(pendingAgentOperationConfirmationSchema.parse(confirmation)).toEqual(confirmation)
    const revision = { isSuccess: true, error: null, pendingOperationId: planOperationId, preview: null, cancelled: true, plan }
    expect(pendingOperationRevisionResultSchema.parse(revision)).toEqual(revision)
  })

  it.each([
    ['Succeeded', 'done'], ['Failed', 'failed'], ['PendingConfirmation', 'pending'],
    ['Denied', 'failed'], ['UnsupportedByPolicy', 'failed'],
  ] as const)('reconciles the validated %s execution outcome with and without a persisted plan', (status, expected) => {
    for (const plan of [undefined, null, makeApprovalPlan(expected)]) {
      const response = agentExecuteOperationResponseSchema.parse({
        operation: { operationId: 'create_habit', sourceName: 'create_habit', riskClass: 'Low', confirmationRequirement: 'FreshConfirmation', status },
        pendingOperation: null, policyDenial: null, plan,
      })
      expect(response.plan).toEqual(plan)
      const store = createStore(createChatStoreState)
      store.setState({ messages: [{ ...makeMessage(), plan: makeApprovalPlan('running') }] })
      reconcileChatPlanExecution(store.getState(), planOperationId, response)
      expect(store.getState().messages[0]?.plan?.steps.map(step => step.status)).toEqual(['done', expected])
    }
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

  it.each([true, false])('reconciles a preview revision with cancelled=%s without changing unrelated steps', cancelled => {
    for (const plan of [undefined, null, makeApprovalPlan('failed')]) {
      const store = createStore(createChatStoreState)
      const original = { ...makeMessage(), plan: makeApprovalPlan('running') }
      const unrelated = { ...makeMessage(), id: 'unrelated', plan: { ...makeAstraPlan(), id: '00000000-0000-4000-8000-000000000001' } }
      store.setState({ messages: [original, unrelated] })
      const revision = pendingOperationRevisionResultSchema.parse({
        isSuccess: true, error: null, pendingOperationId: planOperationId, preview: null, cancelled, plan,
      })
      reconcileChatPlanRevision(store.getState(), planOperationId, revision)
      let expected = 'running'
      if (cancelled) expected = 'skipped'
      if (plan) expected = 'failed'
      expect(store.getState().messages[0]?.plan?.steps.map(step => step.status)).toEqual(['done', expected])
      expect(store.getState().messages[1]).toBe(unrelated)
      expect(original.plan.steps[1]?.status).toBe('running')
    }
  })
})
