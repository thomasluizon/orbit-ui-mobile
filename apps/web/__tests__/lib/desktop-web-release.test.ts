import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/desktop-release/route'
import { getQueryClient } from '@/lib/query-client'
import { takeDesktopChatCheckpoint, writeDesktopChatCheckpoint } from '@/lib/desktop-chat-checkpoint'
import {
  blockDesktopWebReload, canReloadDesktopWeb, desktopShellVersion, desktopWebReleaseSchema,
  reloadDesktopWeb, shellSupportsWeb, watchDesktopWebRelease,
} from '@/lib/desktop-web-release'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'
import { holdAccount } from '@/__tests__/support/account-change'

vi.mock('@/lib/posthog', () => ({ identifyPostHogUser: vi.fn(), resetPostHogUser: vi.fn() }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))
const currentCommit = 'a'.repeat(40)
const nextCommit = 'b'.repeat(40)
const reload = vi.fn()
const cleanups: (() => void)[] = []

beforeEach(() => {
  vi.useFakeTimers()
  sessionStorage.clear()
  localStorage.clear()
  getQueryClient().clear()
  holdAccount('desktop-account')
  useChatStore.setState(useChatStore.getInitialState())
  useUIStore.setState(useUIStore.getInitialState())
  document.body.innerHTML = ''
  vi.stubEnv('WEB_COMMIT_SHA', nextCommit)
  vi.stubGlobal('fetch', vi.fn(async () => GET()))
  vi.stubGlobal('location', { reload })
  reload.mockClear()
})
afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup())
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it('publishes uncached build identity through the real route and admits legacy shells at the initial floor', async () => {
  const response = GET()
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(desktopWebReleaseSchema.parse(await response.json())).toEqual({ commit: nextCommit, minimumShellVersion: '0.0.0' })
  expect(desktopShellVersion()).toBeNull()
  vi.stubGlobal('__TAURI_INTERNALS__', {})
  expect(desktopShellVersion()).toBe('0.0.0')
  vi.stubGlobal('__ORBIT_DESKTOP_VERSION__', '0.1.2')
  expect(desktopShellVersion()).toBe('0.1.2')
  expect(shellSupportsWeb('0.1.2', '0.1.2')).toBe(true)
  expect(shellSupportsWeb('0.10.0', '0.2.9')).toBe(true)
  expect(shellSupportsWeb('0.1.2', '0.1.3')).toBe(false)
})

it('waits for streaming to settle and reloads once with the completed conversation and draft', async () => {
  useChatStore.getState().addMessage({ id: 'question', role: 'user', content: 'Help me plan', timestamp: new Date() })
  useChatStore.setState({ isTyping: true, streamingMessageId: 'reply', draft: 'A follow-up' })
  useUIStore.getState().setAstraConversationOpen(true)
  cleanups.push(watchDesktopWebRelease('0.1.2', currentCommit, vi.fn()))
  await vi.advanceTimersByTimeAsync(5000)
  expect(reload).not.toHaveBeenCalled()
  useChatStore.getState().addMessage({ id: 'reply', role: 'ai', content: 'Start with water', timestamp: new Date() })
  useChatStore.setState({ isTyping: false, streamingMessageId: null })
  await vi.advanceTimersByTimeAsync(5000)
  expect(reload).toHaveBeenCalledOnce()
  const checkpoint = takeDesktopChatCheckpoint('desktop-account')
  expect(checkpoint?.conversationOpen).toBe(true)
  expect(checkpoint?.chat.messages.map(message => message.content)).toEqual(['Help me plan', 'Start with water'])
  expect(checkpoint?.chat.messages[0]!.timestamp).toBeInstanceOf(Date)
  expect(checkpoint?.chat.draft).toBe('A follow-up')
  expect(takeDesktopChatCheckpoint('desktop-account')).toBeNull()
})

it('does not reload for the same build, and retries an offline or malformed metadata read', async () => {
  vi.stubEnv('WEB_COMMIT_SHA', currentCommit)
  cleanups.push(watchDesktopWebRelease('0.1.2', currentCommit, vi.fn()))
  await vi.advanceTimersByTimeAsync(2000)
  expect(reload).not.toHaveBeenCalled()
  vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'))
  await vi.advanceTimersByTimeAsync(60_000)
  expect(reload).not.toHaveBeenCalled()
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({ commit: 'malformed' }))
  await vi.advanceTimersByTimeAsync(60_000)
  expect(reload).not.toHaveBeenCalled()
  vi.stubEnv('WEB_COMMIT_SHA', nextCommit)
  window.dispatchEvent(new Event('online'))
  await vi.advanceTimersByTimeAsync(2000)
  expect(reload).toHaveBeenCalledOnce()
})

it('preserves the current window if storage is unavailable, then retries the reload', async () => {
  const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError') })
  cleanups.push(watchDesktopWebRelease('0.1.2', currentCommit, vi.fn()))
  await vi.advanceTimersByTimeAsync(2000)
  expect(reload).not.toHaveBeenCalled()
  storage.mockRestore()
  await vi.advanceTimersByTimeAsync(2000)
  expect(reload).toHaveBeenCalledOnce()
})

it('guards edits, selections, overlays and attachment or voice blockers', () => {
  expect(canReloadDesktopWeb()).toBe(true)
  const unblock = blockDesktopWebReload()
  expect(canReloadDesktopWeb()).toBe(false)
  unblock()
  document.body.innerHTML = '<input aria-label="Draft" />'
  document.querySelector('input')!.focus()
  expect(canReloadDesktopWeb()).toBe(false)
  document.body.innerHTML = '<form><input /></form>'
  expect(canReloadDesktopWeb()).toBe(false)
  document.body.innerHTML = ''
  useUIStore.setState({ selectedHabitIds: new Set(['habit']) })
  expect(canReloadDesktopWeb()).toBe(false)
  useUIStore.setState({ selectedHabitIds: new Set(), openOverlayIds: ['modal:edit'] })
  expect(canReloadDesktopWeb()).toBe(false)
  useUIStore.setState({ openOverlayIds: [], showCreateModal: true })
  expect(canReloadDesktopWeb()).toBe(false)
  useUIStore.setState({ showCreateModal: false })
  expect(canReloadDesktopWeb()).toBe(true)
})

it('waits for an actual query mutation to finish', async () => {
  const client = getQueryClient()
  let finish!: () => void
  const mutation = client.getMutationCache().build(client, { mutationFn: () => new Promise<void>(resolve => { finish = resolve }) })
  const pending = mutation.execute(undefined)
  await Promise.resolve()
  expect(canReloadDesktopWeb()).toBe(false)
  await vi.advanceTimersByTimeAsync(0)
  finish()
  await pending
  expect(canReloadDesktopWeb()).toBe(true)
})

it('drops an expired or foreign checkpoint and clears it on account reset', async () => {
  await writeDesktopChatCheckpoint('desktop-account', useChatStore.getState(), true)
  expect(takeDesktopChatCheckpoint('other-account')).toBeNull()
  await writeDesktopChatCheckpoint('desktop-account', useChatStore.getState(), true)
  vi.advanceTimersByTime(5 * 60_000)
  expect(takeDesktopChatCheckpoint('desktop-account')).toBeNull()
  await writeDesktopChatCheckpoint('desktop-account', useChatStore.getState(), true)
  holdAccount('replacement-account')
  expect(takeDesktopChatCheckpoint('desktop-account')).toBeNull()
})

it('does not reload or retain a checkpoint when the account changes during image persistence', async () => {
  let complete!: (response: Response) => void
  vi.mocked(fetch).mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
  useChatStore.getState().addMessage({ id: 'image', role: 'user', content: 'Look', imageUrl: 'blob:preview', timestamp: new Date() })
  const pending = reloadDesktopWeb(reload)
  holdAccount('replacement-account')
  complete(new Response(new Blob(['image'], { type: 'image/png' })))
  await vi.advanceTimersByTimeAsync(50)
  expect(await pending).toBe(false)
  expect(reload).not.toHaveBeenCalled()
  expect(takeDesktopChatCheckpoint('desktop-account')).toBeNull()
})

it('stops checks and reloads after unmount', async () => {
  const stop = watchDesktopWebRelease('0.1.2', currentCommit, vi.fn())
  stop()
  const count = vi.mocked(fetch).mock.calls.length
  await vi.advanceTimersByTimeAsync(120_000)
  window.dispatchEvent(new Event('focus'))
  expect(fetch).toHaveBeenCalledTimes(count)
  expect(reload).not.toHaveBeenCalled()
})
