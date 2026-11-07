import { restoreConversationPage } from '../chat/conversation-restore'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createStore } from 'zustand/vanilla'
import { createChatStoreState } from '../stores/chat-store'
import type { ConversationPage } from '../types/conversation'
import { conversationPagePath, createConversationHistory, prepareConversationSend } from '../chat/conversation-history'
import { buildChatClientContext } from '../chat/client-context'
import { COMPACT_FAILED_INDEXES, makeConversationPage, makeExecutedConversationPage, PROPOSED_HABIT_TITLE, REVISED_HABIT_ID, REVISED_HABIT_TITLE, storedOperationId, storedConversationId } from '../test-support/conversation-fixtures'
import { getPendingOperationItemResults } from '../hooks/pending-operation-card-core'
import { pendingOperationExecutionPatch } from '../chat/pending-operation-message-state'
import { agentOperationResultSchema } from '../types/ai'

const store = createStore(createChatStoreState)
const read = vi.fn(async (): Promise<ConversationPage | null> => makeConversationPage())
const remove = vi.fn(async () => {})
let generation = 0
const history = createConversationHistory({ onModuleLoadError: vi.fn(), getState: store.getState, setState: store.setState, getAccountGeneration: () => generation, read, remove })
beforeEach(() => { store.setState(createChatStoreState(store.setState)); vi.clearAllMocks(); read.mockResolvedValue(makeConversationPage()); generation++ })

describe('conversation restoration', () => {
  it('builds the initial and pinned page paths without losing zero or string cursors', () => {
    expect(conversationPagePath()).toBe('/api/chat/conversations/latest?pageSize=40')
    expect(conversationPagePath({ conversationId: storedConversationId, beforeOrder: 0 }))
      .toBe(`/api/chat/conversations/latest?pageSize=40&conversationId=${storedConversationId}&beforeOrder=0`)
    expect(conversationPagePath({ conversationId: storedConversationId, beforeOrder: '9223372036854775806' }))
      .toBe(`/api/chat/conversations/latest?pageSize=40&conversationId=${storedConversationId}&beforeOrder=9223372036854775806`)
  })
  it('uses distinct role identities for one producer turn and existing response parts', () => {
    const messages = restoreConversationPage(makeConversationPage())
    expect(messages.map(message => message.role)).toEqual(['user', 'ai'])
    expect(messages[0]!.id).not.toBe(messages[1]!.id)
    expect(messages[0]!.imageUrl).toContain(`/conversations/${storedConversationId}/images/`)
    expect(messages[1]!.parts).toEqual([{ type: 'text', text: 'Review ready' }])
  })
  it.each(['approved', 'edited', 'expired', 'rejected', 'pending'])('restores a %s preview without implying successful execution', outcome => {
    const page = makeConversationPage()
    page.turns[1]!.previewOutcomesJson = JSON.stringify([{ PendingOperationId: storedOperationId, Outcome: outcome, Arguments: {}, Revision: 2 }])
    const state = restoreConversationPage(page)[1]!.pendingOperationStates?.[storedOperationId]
    if (outcome === 'pending') expect(state).toBeUndefined()
    else if (outcome === 'rejected') expect(state).toMatchObject({ rejected: true, dismissed: true })
    else expect(state).toMatchObject({ recordedOutcome: outcome })
    expect(state?.status).toBeUndefined()
  })
  it.each([['stored', 'done'], ['storedFailure', 'failed']] as const)('rebuilds the block from an approved outcome with a %s execution', (execution, status) => {
    const page = makeExecutedConversationPage(execution)
    const stored = agentOperationResultSchema.parse(JSON.parse(page.turns[1]!.previewOutcomesJson)[0].Execution)
    const state = restoreConversationPage(page)[1]!.pendingOperationStates?.[storedOperationId]
    expect(state).toEqual(pendingOperationExecutionPatch({ ok: true, response: { operation: stored } }))
    expect(state).toMatchObject({ status, canRetry: false, completedOperation: { sourceName: 'bulk_create_habits', status: 'Succeeded', payload: stored.payload } })
    expect(state?.recordedOutcome).toBeUndefined()
  })
  it.each(['absent', 'truncated', 'truncatedFailure', 'failedWithoutPayload'] as const)('keeps the approved notice when the %s execution cannot report each item', execution => {
    const state = restoreConversationPage(makeExecutedConversationPage(execution))[1]!.pendingOperationStates?.[storedOperationId]
    expect(state).toEqual({ recordedOutcome: 'approved' })
  })
  it.each([['Succeeded', 'done'], ['Failed', 'failed']] as const)('rebuilds a %s create_habit execution stored without its payload', (operationStatus, status) => {
    const page = makeExecutedConversationPage()
    const outcomes = JSON.parse(page.turns[1]!.previewOutcomesJson)
    outcomes[0].Execution = { operationId: 'create_habit', sourceName: 'create_habit', riskClass: 'Low', confirmationRequirement: 'FreshConfirmation',
      status: operationStatus, summary: null, targetId: '00000000-0000-4000-8000-000000000020', targetName: null,
      policyReason: operationStatus === 'Failed' ? 'unexpected_error' : null, pendingOperationId: null, payload: null }
    page.turns[1]!.previewOutcomesJson = JSON.stringify(outcomes)
    expect(restoreConversationPage(page)[1]!.pendingOperationStates?.[storedOperationId])
      .toMatchObject({ status, canRetry: false, completedOperation: { sourceName: 'create_habit', targetId: '00000000-0000-4000-8000-000000000020' } })
  })
  it('rebuilds the done block with the approved words of an edited preview', () => {
    const message = restoreConversationPage(makeExecutedConversationPage('revised'))[1]!
    const state = message.pendingOperationStates?.[storedOperationId]
    expect(state).toMatchObject({ status: 'done', canRetry: false, completedOperation: { targetId: REVISED_HABIT_ID } })
    expect(state?.operation).toMatchObject({ id: storedOperationId, actionKey: 'createHabit', capabilityId: 'habits.write', nextAction: null,
      previewFingerprint: 'F8B5A0B62489C24048A0EE1EADDD42A2588779C8277CC0D4AD36C632965325D2' })
    expect(state?.operation?.items?.[0]?.fields.find(field => field.field === 'title')?.newValue).toBe(REVISED_HABIT_TITLE)
    expect(message.pendingOperations?.[0]?.items?.[0]?.entityName).toBe(PROPOSED_HABIT_TITLE)
  })
  it('rebuilds an approval that the API marked unedited from the proposed words', () => {
    const state = restoreConversationPage(makeExecutedConversationPage('proposedOnly', false))[1]!.pendingOperationStates?.[storedOperationId]
    expect(state).toMatchObject({ status: 'done', canRetry: false })
    expect(state?.operation).toBeUndefined()
  })
  it('rebuilds every row of a batch that the API marked unedited', () => {
    const state = restoreConversationPage(makeExecutedConversationPage('batch', false))[1]!.pendingOperationStates?.[storedOperationId]
    expect(state).toMatchObject({ status: 'done', canRetry: false })
    expect(getPendingOperationItemResults(state?.completedOperation)?.map(item => item.status)).toEqual(['Success', 'Success', 'Success'])
  })
  it.each([['batchWithRemovedItem', true], ['batchWithRemovedItem', 'omitted'], ['proposedOnly', true], ['proposedOnly', 'omitted'], ['stored', 'omitted']] as const)(
    'keeps the approved notice when the %s outcome does not prove that the rows on screen ran (PreviewRevised %s)', (execution, previewRevised) => {
      const state = restoreConversationPage(makeExecutedConversationPage(execution, previewRevised))[1]!.pendingOperationStates?.[storedOperationId]
      expect(state).toEqual({ recordedOutcome: 'approved' })
    })
  it.each([true, 'omitted'] as const)('uses the stored approved preview whenever it exists (PreviewRevised %s)', previewRevised => {
    const state = restoreConversationPage(makeExecutedConversationPage('revised', previewRevised))[1]!.pendingOperationStates?.[storedOperationId]
    expect(state).toMatchObject({ status: 'done', canRetry: false })
    expect(state?.operation?.items?.[0]?.fields.find(field => field.field === 'title')?.newValue).toBe(REVISED_HABIT_TITLE)
  })
  it.each([['unchangedLog', 'done'], ['partialLog', 'failed']] as const)('restores the %s bulk log execution as %s', (execution, status) => {
    const state = restoreConversationPage(makeExecutedConversationPage(execution))[1]!.pendingOperationStates?.[storedOperationId]
    expect(state).toMatchObject({ status, canRetry: false })
  })
  it('rebuilds each row outcome of a compact stored batch', () => {
    const state = restoreConversationPage(makeExecutedConversationPage('compact'))[1]!.pendingOperationStates?.[storedOperationId]
    expect(state).toMatchObject({ status: 'failed', canRetry: false })
    expect(state?.recordedOutcome).toBeUndefined()
    const results = getPendingOperationItemResults(state?.completedOperation)
    expect(results).toHaveLength(100)
    expect(results?.filter(item => item.status === 'Failed').map(item => item.index)).toEqual(COMPACT_FAILED_INDEXES)
  })
  it.each([['partialUpdate', 'failed'], ['partialEmojis', 'failed'], ['completeUpdate', 'done']] as const)('restores a %s bulk execution as %s', (execution, status) => {
    const state = restoreConversationPage(makeExecutedConversationPage(execution))[1]!.pendingOperationStates?.[storedOperationId]
    expect(state).toMatchObject({ status, canRetry: false })
  })
  it('deduplicates simultaneous reads and pins earlier pages to their thread', async () => {
    await Promise.all([history.latest(), history.latest()])
    expect(read).toHaveBeenCalledTimes(1)
    read.mockResolvedValue(makeConversationPage({ beforeOrder: null, turns: [] }))
    await history.earlier()
    expect(read).toHaveBeenLastCalledWith({ conversationId: storedConversationId, beforeOrder: 3 })
    expect(store.getState().messages).toHaveLength(2)
    expect(store.getState().conversationBeforeOrder).toBeNull()
  })
  it('prepends earlier turns once and rejects pages for a different conversation', async () => {
    await history.latest()
    const page = makeConversationPage({ beforeOrder: 1 })
    page.turns[0] = { ...page.turns[0]!, turnId: '00000000-0000-4000-8000-000000000004', order: 1 }
    read.mockResolvedValueOnce(page)
    expect(await history.earlier()).toBe(true)
    expect(store.getState().messages.map(message => message.id)).toEqual([
      'stored-00000000-0000-4000-8000-000000000004-user', ...restoreConversationPage(makeConversationPage()).map(message => message.id),
    ])
    read.mockResolvedValueOnce(makeConversationPage({ conversationId: '00000000-0000-4000-8000-000000000005' }))
    expect(await history.earlier()).toBe(false)
    expect(store.getState().messages).toHaveLength(3)
    expect(store.getState().conversationBeforeOrder).toBe(1)
  })
  it('keeps an empty conversation ready after the adapter maps a missing conversation to null', async () => {
    read.mockResolvedValueOnce(null)
    expect(history.isReady()).toBe(false)
    expect(await history.prepareSend()).toBe(true)
    expect(history.isReady()).toBe(true)
    expect(store.getState()).toMatchObject({ messages: [], conversationId: null, serverConversationId: null })
    expect(await history.earlier()).toBe(false)
    expect(await history.remove()).toBe(false)
    expect(prepareConversationSend(history, { astraConversationOpen: true, setAstraConversationOpen: vi.fn() }, vi.fn())).toBe(true)
    expect(await history.prepareSend()).toBe(true)
    expect(read).toHaveBeenCalledOnce()
  })
  it.each(['web', 'mobile'] as const)('hands the restored id to the next %s request and clears it after delete', async platform => {
    await history.latest()
    const context = () => buildChatClientContext({ platform, locale: 'en', conversationId: store.getState().serverConversationId ?? undefined })
    expect(context().conversationId).toBe(storedConversationId)
    expect(await history.remove()).toBe(true)
    expect(remove).toHaveBeenCalledExactlyOnceWith(storedConversationId)
    expect(context().conversationId).toBeUndefined()
  })
  it('does not allow a send prepared for an earlier account', async () => {
    let finish!: (page: ConversationPage) => void
    read.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const pending = history.prepareSend()
    await vi.dynamicImportSettled()
    generation++
    store.setState(createChatStoreState(store.setState))
    finish(makeConversationPage())
    expect(await pending).toBe(false)
    expect(history.isReady()).toBe(false)
    expect(store.getState().serverConversationId).toBeNull()
  })
  it('ignores a response from an earlier account', async () => {
    let finish!: (page: ReturnType<typeof makeConversationPage>) => void
    read.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const pending = history.latest()
    await vi.dynamicImportSettled()
    generation++
    store.setState(createChatStoreState(store.setState))
    finish(makeConversationPage())
    await pending
    expect(store.getState().messages).toEqual([])
  })
  it('forgets a previously restored thread when it is no longer available', async () => {
    await history.latest()
    read.mockResolvedValueOnce(null)
    await history.latest(true)
    expect(store.getState()).toMatchObject({ messages: [], conversationId: null, serverConversationId: null, conversationBeforeOrder: null })
  })
  it('opens immediately and restores the server identity before allowing a send', async () => {
    const open = vi.fn()
    const failure = vi.fn()
    const ready = prepareConversationSend(history, { astraConversationOpen: false, setAstraConversationOpen: open }, failure)
    expect(open).toHaveBeenCalledWith(true)
    expect(await ready).toBe(true)
    expect(store.getState().serverConversationId).toBe(storedConversationId)
    expect(failure).not.toHaveBeenCalled()
  })
  it('keeps the draft and refuses sending when the initial history request fails', async () => {
    store.setState({ draft: 'Keep this request' })
    read.mockRejectedValueOnce(new Error('Network request failed'))
    const failure = vi.fn()
    expect(await prepareConversationSend(history, { astraConversationOpen: true, setAstraConversationOpen: vi.fn() }, failure)).toBe(false)
    expect(failure).toHaveBeenCalledOnce()
    expect(store.getState().draft).toBe('Keep this request')
  })
  it('keeps a failed delete and resets identity after a successful retry', async () => {
    await history.latest()
    remove.mockRejectedValueOnce(new Error('Network request failed'))
    await expect(history.remove()).rejects.toThrow()
    expect(store.getState().serverConversationId).toBe(storedConversationId)
    expect(store.getState().messages).toHaveLength(2)
    await history.remove()
    expect(store.getState()).toMatchObject({ messages: [], conversationId: null, serverConversationId: null, conversationBeforeOrder: null, conversationLoaded: true, conversationBusy: false })
  })
})
