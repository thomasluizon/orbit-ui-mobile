import { describe, expect, it } from 'vitest'
import { createUseReadBlockSession, type ReadBlockSessionAdapters } from '../chat/read-block-session-core'
import { readBlockFrameProps, readBlockPresentation } from '../chat/read-block-core'
import type { BlockFrameProps } from '../contracts/blocks'
import { focusedHistoryFixture, focusedPeriodTotalFixture, focusedReadMetadataFixture } from '../test-support/chat-fixtures'
import { readBlockResponseSchema, type ChatClientContext, type ReadBlockResponse } from '../types/chat'

const total = { kind: 'periodTotal', block: focusedPeriodTotalFixture, read: focusedReadMetadataFixture } satisfies ReadBlockResponse
const history = readBlockResponseSchema.parse({ kind: 'recordList', block: focusedHistoryFixture, read: focusedHistoryFixture.read })

function setup(initial: ReadBlockResponse = total, platform: ChatClientContext['platform'] = 'web') {
  const slots: unknown[] = []
  let slot = 0
  let cleanup: (() => void) | undefined
  let generation = 1
  let resolve!: (response: ReadBlockResponse) => void
  let reject!: (error: unknown) => void
  const requests: { token: string; clientContext: ChatClientContext; page: boolean; isCurrent: () => boolean }[] = []
  const adapters: ReadBlockSessionAdapters = {
    useState: <T>(initialState: T) => {
      const index = slot++
      if (!(index in slots)) slots[index] = initialState
      return [slots[index] as T, (value: T) => { slots[index] = value }]
    },
    useRef: <T>(initialValue: T) => {
      const index = slot++
      if (!(index in slots)) slots[index] = { current: initialValue }
      return slots[index] as { current: T }
    },
    useEffect: (effect) => { cleanup ??= effect() },
    getAccountGeneration: () => generation,
    platform,
    refresh: (token, clientContext, page, isCurrent) => {
      requests.push({ token, clientContext, page, isCurrent })
      return new Promise((done, fail) => { resolve = done; reject = fail })
    },
  }
  const useSession = createUseReadBlockSession(adapters)
  return {
    requests,
    render: (ready = true) => { slot = 0; return useSession(initial, 'pt-BR', { ready, timeZone: 'UTC' }) },
    resolve: (response: ReadBlockResponse) => resolve(response),
    reject: (error: unknown) => reject(error),
    changeAccount: () => { generation += 1 },
    unmount: () => cleanup?.(),
  }
}

describe('shared read block session', () => {
  it.each(['web', 'mobile'] as const)('refreshes the signed query with the %s context and gates live actions', async platform => {
    const session = setup(total, platform)
    expect(session.render(false).actionScope.ready).toBe(false)
    const request = session.render().run(false)
    expect(session.render()).toMatchObject({ snapshot: total, pending: true, failure: null, actionScope: { ready: false } })
    expect(session.requests).toMatchObject([{ token: 'signed-query', page: false, clientContext: { platform, locale: 'pt-BR', partKinds: expect.arrayContaining(['periodTotal', 'periodComparison']) } }])
    expect(session.requests[0]!.isCurrent()).toBe(true)
    const updated = { ...total, block: { ...focusedPeriodTotalFixture, value: 18 }, read: { ...total.read, revision: 'two' } }
    session.resolve(updated)
    await request
    expect(session.render()).toMatchObject({ snapshot: updated, pending: false, failure: null, actionScope: { ready: true } })
  })

  it('pages from the latest accepted cursor while preserving dated zero values', async () => {
    const session = setup(history)
    const request = session.render().run(true)
    expect(session.requests[0]).toMatchObject({ token: 'signed-page', page: true })
    const next = readBlockResponseSchema.parse({ kind: 'recordList', block: { ...focusedHistoryFixture, items: [{ id: 'second', title: 'Next log', logDate: '2026-09-02', value: -1 }] }, read: { ...history.read, nextCursor: null } })
    session.resolve(next)
    await request
    const current = session.render()
    expect(current.snapshot).toMatchObject({ block: { items: [{ logDate: '2026-09-01', value: 0 }, { logDate: '2026-09-02', value: -1 }] } })
    await current.run(true)
    expect(session.requests).toHaveLength(1)
  })

  it('ignores a second tap before React can render pending', async () => {
    const session = setup()
    const current = session.render()
    const request = current.run(false)
    await current.run(false)
    await session.render().run(true)
    expect(session.requests).toHaveLength(1)
    session.resolve(total)
    await request
    const retry = session.render().run(false)
    expect(session.requests).toHaveLength(2)
    session.resolve(total)
    await retry
    expect(session.render().pending).toBe(false)
  })

  it.each(['account', 'unmount'] as const)('discards both success and failure after %s invalidates the session', async invalidation => {
    for (const fails of [false, true]) {
      const session = setup()
      const request = session.render().run(false)
      if (invalidation === 'account') session.changeAccount()
      else session.unmount()
      expect(session.requests[0]!.isCurrent()).toBe(false)
      if (fails) session.reject(new Error('READ_QUERY_STALE'))
      else session.resolve({ ...total, block: { ...focusedPeriodTotalFixture, value: 99 } })
      await request
      expect(session.render()).toMatchObject({ snapshot: total, failure: null })
    }
  })

  it.each([
    ['READ_QUERY_EXPIRED', 'chat.readBlock.expired'],
    ['READ_QUERY_STALE', 'chat.readBlock.stale'],
    ['offline', 'chat.readBlock.error'],
  ])('retains the snapshot and clears %s on retry', async (code, key) => {
    const session = setup()
    const request = session.render().run(false)
    session.reject(new Error(code))
    await request
    expect(session.render()).toMatchObject({ snapshot: total, failure: key, pending: false, actionScope: { ready: true } })
    const retry = session.render().run(false)
    expect(session.render().failure).toBeNull()
    session.resolve(total)
    await retry
    expect(session.render()).toMatchObject({ failure: null, pending: false })
  })

  it('rejects a mismatched query and a changed page revision through compact recovery', async () => {
    for (const page of [false, true]) {
      const session = setup(history)
      const request = session.render().run(page)
      session.resolve({ ...history, read: { ...history.read, ...(page ? { revision: 'other' } : { queryId: 'other' }) } })
      await request
      expect(session.render()).toMatchObject({ snapshot: history, pending: false, failure: page ? 'chat.readBlock.stale' : 'chat.readBlock.error' })
    }
  })
})

it('derives paging eligibility from the final frame state and signed cursor', () => {
  expect(readBlockPresentation(history, 'resting', false, null).canPage).toBe(true)
  expect(readBlockPresentation(history, 'stale', false, null).canPage).toBe(true)
  expect(readBlockPresentation(history, 'resting', false, 'chat.readBlock.stale').canPage).toBe(false)
  const stale = { ...history, read: { ...history.read, completeness: 'stale' as const } }
  expect(readBlockPresentation(stale, 'resting', false, null).canPage).toBe(false)
  expect(readBlockPresentation(stale, 'resting', true, null)).toMatchObject({ state: 'acting', canPage: true })
  expect(readBlockPresentation({ ...history, read: { ...history.read, nextCursor: null } }, 'resting', false, null).canPage).toBe(false)
})

it('retains stale recap actions while clearing stale-only properties after recovery', () => {
  let refreshed = false
  const refresh = () => { refreshed = true }
  const props: BlockFrameProps = { title: 'Recap', items: [], state: 'stale', staleMessage: 'Old message', refreshLabel: 'Refresh', actions: 'Recap disclosure' }
  const stale = readBlockFrameProps(props, 'stale', null, refresh, key => key, 'Query actions')
  expect(stale).toMatchObject({ state: 'stale', staleMessage: 'chat.readBlock.stale', actions: 'Recap disclosure', staleActions: 'Recap disclosure', refreshLabel: 'Refresh' })
  stale.onRefresh?.()
  expect(refreshed).toBe(true)
  expect(readBlockFrameProps(props, 'stale', 'chat.readBlock.expired', refresh, key => key, 'Query actions').staleMessage).toBe('chat.readBlock.expired')
  const recovered = readBlockFrameProps(props, 'resting', null, refresh, key => key, 'Query actions')
  expect(recovered).toMatchObject({ state: 'resting', actions: 'Query actions', staleMessage: undefined, staleActions: undefined, onRefresh: undefined, refreshLabel: undefined })
})
