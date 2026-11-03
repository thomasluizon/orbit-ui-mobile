import { StrictMode } from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, onTestFinished, vi } from 'vitest'
import { captureException } from '@sentry/nextjs'
import { MODULE_LOAD_TIMEOUT_MS } from '@orbit/shared/utils'
import { DesktopReleaseShell } from '@/components/desktop-release-shell'
import { takeDesktopChatCheckpoint, writeDesktopChatCheckpoint } from '@/lib/desktop-chat-checkpoint'
import { canReloadDesktopWeb, reloadDesktopWeb } from '@/lib/desktop-web-release'
import { desktopChatCheckpointKey, hasWebReloadBlockers } from '@/lib/web-reload-state'
import { reloadStaleBuildOnce } from '@/lib/stale-build-recovery'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'
import { holdAccount } from '@/__tests__/support/account-change'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))
vi.mock('@/lib/posthog', () => ({ identifyPostHogUser: vi.fn(), resetPostHogUser: vi.fn() }))
vi.mock('@/lib/desktop-updates', () => ({ watchDesktopUpdates: () => () => {}, desktopOffersSupported: () => true }))
vi.mock('@/lib/stale-build-recovery', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/stale-build-recovery')>(), reloadStaleBuildOnce: vi.fn(),
}))

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  sessionStorage.clear()
  localStorage.clear()
  holdAccount('desktop-account')
  useChatStore.setState(useChatStore.getInitialState())
  useUIStore.setState(useUIStore.getInitialState())
  vi.stubGlobal('__TAURI_INTERNALS__', {})
  vi.stubGlobal('__ORBIT_DESKTOP_VERSION__', '0.1.2')
})
afterEach(() => {
  cleanup()
  vi.doUnmock('@/lib/desktop-chat-checkpoint-schema')
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

async function saveCheckpoint() {
  useChatStore.getState().addMessage({ id: 'saved', role: 'user', content: 'Saved thread', timestamp: new Date() })
  useChatStore.getState().setDraft('Saved draft')
  await writeDesktopChatCheckpoint('desktop-account', useChatStore.getState(), true)
  useChatStore.setState(useChatStore.getInitialState())
  return sessionStorage.getItem(desktopChatCheckpointKey)
}

async function delaySchema() {
  const original = await vi.importActual<typeof import('@/lib/desktop-chat-checkpoint-schema')>('@/lib/desktop-chat-checkpoint-schema')
  let finish!: (module: typeof original) => void
  const promise = new Promise<typeof original>(resolve => { finish = resolve })
  vi.doMock('@/lib/desktop-chat-checkpoint-schema', () => promise)
  onTestFinished(async () => { finish(original); await vi.dynamicImportSettled() })
  return () => finish(original)
}

function monitor(strict = false) {
  const shell = <DesktopReleaseShell monitor minimum="0.0.0" onUpdateRequired={vi.fn()} />
  return render(strict ? <StrictMode>{shell}</StrictMode> : shell)
}

it('retains the saved checkpoint when its schema import rejects', async () => {
  const stored = await saveCheckpoint()
  const error = new Error('Loading schema failed')
  vi.doMock('@/lib/desktop-chat-checkpoint-schema', () => ({ get then() { throw error } }))
  await expect(takeDesktopChatCheckpoint('desktop-account')).rejects.toBe(error)
  await vi.dynamicImportSettled()
  expect(sessionStorage.getItem(desktopChatCheckpointKey)).toBe(stored)
})

it('lets only the live Strict Mode effect consume the checkpoint after schema loading', async () => {
  await saveCheckpoint()
  const finish = await delaySchema()
  monitor(true)
  await act(async () => { finish(); await vi.dynamicImportSettled() })
  expect(useChatStore.getState().messages.map(message => message.content)).toEqual(['Saved thread'])
  expect(useChatStore.getState().draft).toBe('Saved draft')
  expect(useUIStore.getState().astraConversationOpen).toBe(true)
  expect(sessionStorage.getItem(desktopChatCheckpointKey)).toBeNull()
  expect(hasWebReloadBlockers()).toBe(false)
})

it.each([false, true])('restores the draft and open state independently of a new thread, with newer draft %s', async edited => {
  await saveCheckpoint()
  const finish = await delaySchema()
  monitor()
  useChatStore.getState().addMessage({ id: 'new', role: 'user', content: 'New thread', timestamp: new Date() })
  if (edited) useChatStore.getState().setDraft('New draft')
  await act(async () => { finish(); await vi.dynamicImportSettled() })
  expect(useChatStore.getState().messages.map(message => message.content)).toEqual(['New thread'])
  expect(useChatStore.getState().draft).toBe(edited ? 'New draft' : 'Saved draft')
  expect(useUIStore.getState().astraConversationOpen).toBe(true)
})

it('settles the reload block on a stalled schema import and leaves saved content intact', async () => {
  const stored = await saveCheckpoint()
  const finish = await delaySchema()
  monitor()
  expect(hasWebReloadBlockers()).toBe(true)
  await act(async () => { await vi.advanceTimersByTimeAsync(MODULE_LOAD_TIMEOUT_MS) })
  expect(hasWebReloadBlockers()).toBe(false)
  expect(canReloadDesktopWeb()).toBe(true)
  expect(captureException).toHaveBeenCalledOnce()
  expect(sessionStorage.getItem(desktopChatCheckpointKey)).toBe(stored)
  await act(async () => { finish(); await vi.dynamicImportSettled() })
  expect(useChatStore.getState().draft).toBe('')
})

it.each([false, true])('recovers an unconsumed checkpoint after a failed restore and a subsequent restart, persistent %s', async persistent => {
  const stored = await saveCheckpoint()
  const finish = await delaySchema()
  const mounted = monitor()
  await act(async () => { await vi.advanceTimersByTimeAsync(MODULE_LOAD_TIMEOUT_MS) })
  await act(async () => { finish(); await vi.dynamicImportSettled() })
  expect(canReloadDesktopWeb()).toBe(true)
  const reload = vi.fn()
  await expect(reloadDesktopWeb(reload, persistent)).resolves.toBe(true)
  expect(reload).toHaveBeenCalledOnce()
  expect(sessionStorage.getItem(desktopChatCheckpointKey)).toBe(stored)
  if (persistent) expect(localStorage.getItem(desktopChatCheckpointKey)).toBe(stored)
  mounted.unmount()
  monitor()
  await act(async () => { await vi.dynamicImportSettled() })
  expect(useChatStore.getState().draft).toBe('Saved draft')
  expect(useChatStore.getState().messages.map(message => message.content)).toEqual(['Saved thread'])
  expect(sessionStorage.getItem(desktopChatCheckpointKey)).toBeNull()
  expect(localStorage.getItem(desktopChatCheckpointKey)).toBeNull()
  expect(hasWebReloadBlockers()).toBe(false)
})

it('reports a missing schema chunk and invokes stale-build recovery', async () => {
  await saveCheckpoint()
  const error = new Error('Loading schema failed')
  error.name = 'ChunkLoadError'
  vi.doMock('@/lib/desktop-chat-checkpoint-schema', () => ({ get then() { throw error } }))
  monitor()
  await act(async () => { await vi.dynamicImportSettled() })
  expect(captureException).toHaveBeenCalledExactlyOnceWith(error)
  expect(reloadStaleBuildOnce).toHaveBeenCalledOnce()
  expect(hasWebReloadBlockers()).toBe(false)
})

it('loads the schema before fetching image bytes for a checkpoint write', async () => {
  const error = new Error('Loading schema failed')
  vi.doMock('@/lib/desktop-chat-checkpoint-schema', () => ({ get then() { throw error } }))
  vi.stubGlobal('fetch', vi.fn(async () => new Response('image', { headers: { 'Content-Type': 'image/png' } })))
  useChatStore.getState().addMessage({ id: 'image', role: 'user', content: 'Look', imageUrl: 'blob:preview', timestamp: new Date() })
  const writing = writeDesktopChatCheckpoint('desktop-account', useChatStore.getState(), true)
  const rejected = expect(writing).rejects.toBe(error)
  await vi.dynamicImportSettled()
  await rejected
  expect(fetch).not.toHaveBeenCalled()
})
