import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { GET } from '@/app/api/desktop-release/route'
import { Providers } from '@/lib/providers'
import { RenderedAccountSeed } from '@/app/(app)/rendered-account-seed'
import { DesktopReleaseBoundary } from '@/components/desktop-release-boundary'
import { UpdateAvailableBanner } from '@/components/ui/update-available-banner'
import { useDesktopUpdateStore } from '@/stores/desktop-update-store'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'
import { getQueryClient } from '@/lib/query-client'
import { takeDesktopChatCheckpoint, writeDesktopChatCheckpoint } from '@/lib/desktop-chat-checkpoint'
import { blockDesktopWebReload } from '@/lib/web-reload-state'
import { holdAccount, retireHeldAccount } from '@/__tests__/support/account-change'

vi.mock('@/lib/posthog', () => ({ identifyPostHogUser: vi.fn(), resetPostHogUser: vi.fn() }))
vi.mock('@/components/service-worker-bridge', () => ({ ServiceWorkerBridge: () => null }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))
const currentCommit = 'a'.repeat(40)
const nextCommit = 'b'.repeat(40)
const reload = vi.fn()
const native = {
  phase: 'idle', shellVersion: null as string | null, webCommit: null as string | null,
  deferred: false, restartRequested: false, checking: false, checkFailed: false,
  promptPending: false,
}
let installReservation: string | null = null
async function operateNative(_command: string, payload: Record<string, unknown>) {
  if (payload.action === 'web-release') native.webCommit = payload.commit as string | null
  if (payload.action === 'defer') { native.deferred = true; installReservation = null }
  if (payload.action === 'cancel') native.restartRequested = false
  if (payload.action === 'release' && payload.reservation === installReservation) installReservation = null
  if (payload.action === 'download') {
    if (typeof payload.reservation !== 'string') throw new Error('Missing desktop update reservation')
    native.phase = 'downloaded'
    installReservation = payload.reservation
  }
  if (payload.action === 'install') {
    if (native.phase !== 'downloaded') throw new Error('Desktop update is not downloaded')
    native.phase = 'installing'
    installReservation = null
  }
  return { ...native }
}
const invoke = vi.fn(operateNative)

beforeAll(async () => { await import('@/components/desktop-release-shell') })

beforeEach(() => {
  vi.useFakeTimers()
  sessionStorage.clear()
  localStorage.clear()
  getQueryClient().clear()
  holdAccount('desktop-account')
  useChatStore.setState(useChatStore.getInitialState())
  useUIStore.setState(useUIStore.getInitialState())
  useDesktopUpdateStore.setState({ notice: null, restart: null, later: null })
  Object.assign(native, { phase: 'idle', shellVersion: null, webCommit: null, deferred: false, restartRequested: false, checking: false, checkFailed: false })
  native.promptPending = false
  installReservation = null
  invoke.mockReset().mockImplementation(operateNative)
  reload.mockClear()
  vi.stubEnv('WEB_COMMIT_SHA', currentCommit)
  vi.stubEnv('NEXT_PUBLIC_WEB_COMMIT_SHA', currentCommit)
  vi.stubGlobal('fetch', vi.fn(async () => GET()))
  vi.stubGlobal('location', { reload })
  vi.stubGlobal('__TAURI_INTERNALS__', { invoke })
  vi.stubGlobal('__ORBIT_DESKTOP_VERSION__', '0.1.2')
  vi.stubGlobal('__ORBIT_DESKTOP_UPDATES__', true)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

function mount(messages = en, locale = 'en') {
  return render(<NextIntlClientProvider locale={locale} messages={messages}>
    <DesktopReleaseBoundary monitor><p>Hoje</p><UpdateAvailableBanner /></DesktopReleaseBoundary>
  </NextIntlClientProvider>)
}
async function tick(milliseconds = 2000) {
  await act(async () => {})
  await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds) })
}
async function click(name: string) { await act(async () => { fireEvent.click(screen.getByRole('button', { name })) }) }
function actions() { return invoke.mock.calls.map(([, payload]) => payload.action) }

it('checks on launch, focus and each minute and cleans up all checks on unmount', async () => {
  const application = mount()
  await tick()
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('button', { name: en.versionUpdate.restartCta })).toBeNull()
  await act(async () => { window.dispatchEvent(new Event('focus')) })
  expect(fetch).toHaveBeenCalledTimes(2)
  await tick(60_000)
  expect(fetch).toHaveBeenCalledTimes(3)
  expect(reload).not.toHaveBeenCalled()
  application.unmount()
  const count = vi.mocked(fetch).mock.calls.length
  const nativeCount = invoke.mock.calls.length
  await tick(60_000)
  window.dispatchEvent(new Event('focus'))
  expect(fetch).toHaveBeenCalledTimes(count)
  expect(invoke).toHaveBeenCalledTimes(nativeCount)
})

it.each([{ messages: en, locale: 'en' }, { messages: ptBR, locale: 'pt-BR' }])(
  'offers a web release in $locale and checkpoints only after explicit Restart', async ({ messages, locale }) => {
    vi.stubEnv('WEB_COMMIT_SHA', nextCommit)
    useChatStore.setState({ draft: 'Tomorrow too?' })
    useUIStore.getState().setAstraConversationOpen(true)
    mount(messages, locale)
    await tick()
    expect(screen.getByRole('status')).toHaveTextContent(messages.forceUpdate.banner)
    expect(screen.getByRole('button', { name: messages.versionUpdate.laterCta })).toBeVisible()
    expect(sessionStorage.length).toBe(0)
    expect(reload).not.toHaveBeenCalled()
    await click(messages.versionUpdate.restartCta)
    expect(reload).toHaveBeenCalledOnce()
    expect(actions()).not.toContain('download')
    expect(actions()).not.toContain('install')
    const checkpoint = takeDesktopChatCheckpoint('desktop-account')
    expect(checkpoint?.chat.draft).toBe('Tomorrow too?')
    expect(checkpoint?.conversationOpen).toBe(true)
  },
)

it('Later survives checks and a webview remount, while a newer release is offered again', async () => {
  vi.stubEnv('WEB_COMMIT_SHA', nextCommit)
  let application = mount()
  await tick()
  await click(en.versionUpdate.laterCta)
  await tick(60_000)
  expect(screen.queryByRole('button', { name: en.versionUpdate.restartCta })).toBeNull()
  application.unmount()
  application = mount()
  await tick()
  expect(screen.queryByRole('button', { name: en.versionUpdate.restartCta })).toBeNull()
  vi.stubEnv('WEB_COMMIT_SHA', 'c'.repeat(40))
  native.deferred = false
  await tick(60_000)
  expect(screen.getByRole('button', { name: en.versionUpdate.restartCta })).toBeVisible()
  expect(reload).not.toHaveBeenCalled()
  application.unmount()
})

it('a new process offers the deferred shell version again', async () => {
  native.shellVersion = '0.2.0'
  native.phase = 'available'
  const first = mount()
  await tick()
  await click(en.versionUpdate.laterCta)
  expect(native.deferred).toBe(true)
  first.unmount()
  native.deferred = false
  mount()
  await tick()
  expect(screen.getByRole('button', { name: en.versionUpdate.restartCta })).toBeVisible()
})

it('waits for Astra, typing, overlays and attachment work before showing the notice', async () => {
  vi.stubEnv('WEB_COMMIT_SHA', nextCommit)
  useChatStore.setState({ isTyping: true, streamingMessageId: 'reply' })
  mount()
  await tick()
  expect(screen.queryByText(en.forceUpdate.banner)).toBeNull()
  useChatStore.setState({ isTyping: false, streamingMessageId: null })
  const input = document.createElement('input')
  document.body.append(input)
  input.focus()
  await tick()
  expect(screen.queryByText(en.forceUpdate.banner)).toBeNull()
  input.remove()
  const unblock = blockDesktopWebReload()
  await tick()
  expect(screen.queryByText(en.forceUpdate.banner)).toBeNull()
  unblock()
  useUIStore.setState({ openOverlayIds: ['modal:edit'] })
  await tick()
  expect(screen.queryByText(en.forceUpdate.banner)).toBeNull()
  useUIStore.setState({ openOverlayIds: [] })
  await tick()
  expect(screen.getByText(en.forceUpdate.banner)).toBeVisible()
  expect(reload).not.toHaveBeenCalled()
})

it('waits for the native dialog and edits made during the download before installing', async () => {
  native.phase = 'available'
  native.shellVersion = '0.2.0'
  let finishDownload!: () => void
  const original = invoke.getMockImplementation()!
  invoke.mockImplementation(async (command, payload) => {
    if (payload.action === 'download' && native.phase !== 'downloaded') {
      await original(command, payload)
      native.phase = 'downloading'
      await new Promise<void>(resolve => { finishDownload = resolve })
      native.phase = 'downloaded'
      native.promptPending = true
      return { ...native }
    }
    return original(command, payload)
  })
  mount()
  await tick()
  expect(actions()).not.toContain('download')
  await click(en.versionUpdate.restartCta)
  expect(screen.getByRole('status')).toHaveTextContent(en.desktopUpdate.downloading)
  expect(screen.getByRole('button', { name: en.versionUpdate.restartCta })).toBeDisabled()
  const input = document.createElement('input')
  document.body.append(input)
  input.focus()
  useChatStore.setState({ draft: 'Changed during download' })
  await act(async () => { finishDownload() })
  await tick()
  expect(actions()).not.toContain('install')
  input.remove()
  await tick()
  expect(actions()).not.toContain('install')
  native.promptPending = false
  native.restartRequested = true
  await tick()
  expect(actions().filter(action => action === 'install')).toHaveLength(1)
  expect(reload).not.toHaveBeenCalled()
  sessionStorage.clear()
  expect(takeDesktopChatCheckpoint('desktop-account')?.chat.draft).toBe('Changed during download')
  expect(localStorage.getItem('orbit-desktop-web-reload')).toBeNull()
})

it('shows a failed download with an explicit retry and never installs the failed package', async () => {
  native.phase = 'available'
  native.shellVersion = '0.2.0'
  const original = invoke.getMockImplementation()!
  let attempts = 0
  invoke.mockImplementation(async (command, payload) => {
    if (payload.action === 'download' && attempts++ === 0) {
      native.phase = 'failed'
      return { ...native }
    }
    return original(command, payload)
  })
  mount()
  await tick()
  await click(en.versionUpdate.restartCta)
  expect(screen.getByRole('status')).toHaveTextContent(en.desktopUpdate.failed)
  expect(actions()).not.toContain('install')
  await tick()
  expect(attempts).toBe(1)
  await click(en.common.retry)
  expect(actions()).toContain('install')
})

it('reserves a cached download through a newer focus check during the asynchronous checkpoint', async () => {
  native.shellVersion = '0.2.0'
  const reservation = crypto.randomUUID()
  await operateNative('desktop_update', { action: 'download', reservation })
  await operateNative('desktop_update', { action: 'release', reservation })
  let finishImage!: (response: Response) => void
  const image = new Promise<Response>(resolve => { finishImage = resolve })
  vi.mocked(fetch).mockImplementation(async request => request === 'blob:preview' ? image : GET())
  useChatStore.getState().addMessage({ id: 'image', role: 'user', content: 'Keep this', imageUrl: 'blob:preview', timestamp: new Date() })
  mount()
  await tick()
  await click(en.versionUpdate.restartCta)
  expect(fetch).toHaveBeenCalledWith('blob:preview')
  expect(actions()).not.toContain('install')
  if (!installReservation) Object.assign(native, { shellVersion: '0.3.0', phase: 'available' })
  await act(async () => { window.dispatchEvent(new Event('focus')) })
  await tick(60_000)
  await act(async () => { finishImage(new Response('image', { headers: { 'Content-Type': 'image/png' } })) })
  await tick(50)
  expect(screen.queryByText(en.desktopUpdate.failed)).toBeNull()
  expect(native.phase).toBe('installing')
  expect(native.shellVersion).toBe('0.2.0')
  expect(actions().filter(action => action === 'install')).toHaveLength(1)
  expect(takeDesktopChatCheckpoint('desktop-account')?.chat.messages[0]?.imageUrl).toBe('data:image/png;base64,aW1hZ2U=')
})

it('keeps a remounted controller reservation when an older checkpoint finishes', async () => {
  native.shellVersion = '0.2.0'
  native.phase = 'available'
  const finishImages: ((response: Response) => void)[] = []
  vi.mocked(fetch).mockImplementation(async request => request === 'blob:preview'
    ? new Promise<Response>(resolve => { finishImages.push(resolve) }) : GET())
  useChatStore.getState().addMessage({ id: 'image', role: 'user', content: 'Keep this', imageUrl: 'blob:preview', timestamp: new Date() })
  const first = mount()
  await tick()
  await click(en.versionUpdate.restartCta)
  expect(finishImages).toHaveLength(1)
  expect(installReservation).not.toBeNull()
  first.unmount()
  expect(installReservation).toBeNull()
  mount()
  await tick()
  await click(en.versionUpdate.restartCta)
  expect(finishImages).toHaveLength(2)
  expect(installReservation).not.toBeNull()
  await act(async () => { finishImages[0]!(new Response('old image', { headers: { 'Content-Type': 'image/png' } })) })
  await tick(50)
  if (!installReservation) Object.assign(native, { shellVersion: '0.3.0', phase: 'available' })
  await act(async () => { window.dispatchEvent(new Event('focus')) })
  await act(async () => { finishImages[1]!(new Response('image', { headers: { 'Content-Type': 'image/png' } })) })
  await tick(50)
  expect(screen.queryByText(en.desktopUpdate.failed)).toBeNull()
  expect(native.phase).toBe('installing')
  expect(native.shellVersion).toBe('0.2.0')
  expect(actions().filter(action => action === 'install')).toHaveLength(1)
  expect(takeDesktopChatCheckpoint('desktop-account')?.chat.messages[0]?.imageUrl).toBe('data:image/png;base64,aW1hZ2U=')
})

it.each(['download', 'checkpoint'])('releases a stopped controller when its late %s completes without a successor', async pending => {
  native.shellVersion = '0.2.0'
  native.phase = 'available'
  let finishPending!: () => void
  const completion = new Promise<void>(resolve => { finishPending = resolve })
  if (pending === 'checkpoint') {
    useChatStore.getState().addMessage({ id: 'image', role: 'user', content: 'Keep this', imageUrl: 'blob:preview', timestamp: new Date() })
    vi.mocked(fetch).mockImplementation(async request => {
      if (request !== 'blob:preview') return GET()
      await completion
      return new Response('image', { headers: { 'Content-Type': 'image/png' } })
    })
  } else {
    invoke.mockImplementation(async (command, payload) => {
      const snapshot = await operateNative(command, payload)
      if (payload.action !== 'download') return snapshot
      native.phase = 'downloading'
      await completion
      native.phase = 'downloaded'
      return { ...native }
    })
  }
  const application = mount()
  await tick()
  await click(en.versionUpdate.restartCta)
  expect(installReservation).not.toBeNull()
  application.unmount()
  await act(async () => { finishPending() })
  await tick(50)
  expect(installReservation).toBeNull()
  expect(actions()).not.toContain('install')
  expect(localStorage.getItem('orbit-desktop-web-reload')).toBeNull()
  if (!installReservation) Object.assign(native, { shellVersion: '0.3.0', phase: 'available' })
  mount()
  await tick()
  expect(screen.getByRole('button', { name: en.versionUpdate.restartCta })).toBeVisible()
})

it.each(['checkpoint failure', 'unmount'])('releases the install handoff after %s so a newer offer can appear', async reason => {
  native.shellVersion = '0.2.0'
  native.phase = 'available'
  const application = mount()
  await tick()
  const storage = vi.spyOn(Storage.prototype, 'setItem')
  if (reason === 'checkpoint failure') storage.mockImplementation(() => { throw new Error('storage unavailable') })
  else invoke.mockImplementation(async (command, payload) => {
    const snapshot = await operateNative(command, payload)
    if (payload.action === 'download') useChatStore.setState({ isTyping: true })
    return snapshot
  })
  await click(en.versionUpdate.restartCta)
  expect(actions()).not.toContain('install')
  if (reason === 'checkpoint failure') expect(screen.getByRole('status')).toHaveTextContent(en.desktopUpdate.failed)
  else application.unmount()
  storage.mockRestore()
  expect(installReservation).toBeNull()
  if (!installReservation) Object.assign(native, { shellVersion: '0.3.0', phase: 'available' })
  useChatStore.setState({ isTyping: false })
  invoke.mockImplementation(operateNative)
  if (reason === 'unmount') mount()
  await tick()
  expect(screen.getByRole('button', { name: reason === 'checkpoint failure' ? en.common.retry : en.versionUpdate.restartCta })).toBeVisible()
  await click(reason === 'checkpoint failure' ? en.common.retry : en.versionUpdate.restartCta)
  expect(native.phase).toBe('installing')
  expect(native.shellVersion).toBe('0.3.0')
})

it('a native menu restart waits for streaming and acknowledges the request before applying once', async () => {
  vi.stubEnv('WEB_COMMIT_SHA', nextCommit)
  mount()
  await tick()
  useChatStore.setState({ isTyping: true })
  native.restartRequested = true
  await tick()
  expect(reload).not.toHaveBeenCalled()
  expect(native.restartRequested).toBe(false)
  useChatStore.setState({ isTyping: false })
  await tick()
  expect(reload).toHaveBeenCalledOnce()
})

it('a native Later decision cancels a pending restart until Quit requests the settled checkpoint', async () => {
  native.phase = 'available'
  native.shellVersion = '0.2.0'
  invoke.mockImplementation(async (command, payload) => {
    const snapshot = await operateNative(command, payload)
    if (payload.action === 'download' && !native.restartRequested && !native.deferred) {
      native.deferred = true
      return { ...native }
    }
    return snapshot
  })
  mount()
  await tick()
  await click(en.versionUpdate.restartCta)
  await tick()
  expect(actions()).not.toContain('install')
  expect(screen.queryByRole('button', { name: en.versionUpdate.restartCta })).toBeNull()
  invoke.mockImplementation(operateNative)
  useChatStore.setState({ isTyping: true, draft: 'Continue after launch' })
  native.deferred = false
  native.restartRequested = true
  await tick()
  expect(actions()).not.toContain('install')
  useChatStore.setState({ isTyping: false })
  await tick()
  expect(actions().filter(action => action === 'install')).toHaveLength(1)
  sessionStorage.clear()
  expect(takeDesktopChatCheckpoint('desktop-account')?.chat.draft).toBe('Continue after launch')
})

it('a ready native prompt stays hidden from the web notice until its decision arrives', async () => {
  native.shellVersion = '0.2.0'
  native.phase = 'downloaded'
  native.promptPending = true
  mount()
  await tick()
  expect(screen.getByRole('status')).toBeEmptyDOMElement()
  expect(actions()).not.toContain('download')
  expect(actions()).not.toContain('install')
  native.promptPending = false
  native.restartRequested = true
  await tick()
  expect(actions().filter(action => action === 'install')).toHaveLength(1)
})

it('keeps restart offers usable in shells without native dialog status', async () => {
  native.shellVersion = '0.2.0'
  native.phase = 'available'
  invoke.mockImplementation(async (command, payload) => {
    const snapshot = await operateNative(command, payload)
    Reflect.deleteProperty(snapshot, 'promptPending')
    return snapshot
  })
  mount()
  await tick()
  await click(en.versionUpdate.restartCta)
  expect(native.phase).toBe('installing')
  expect(actions().filter(action => action === 'install')).toHaveLength(1)
})

it('retains the conversation and exposes Retry when checkpoint persistence fails', async () => {
  vi.stubEnv('WEB_COMMIT_SHA', nextCommit)
  mount()
  await tick()
  const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage unavailable') })
  await click(en.versionUpdate.restartCta)
  expect(reload).not.toHaveBeenCalled()
  expect(screen.getByRole('status')).toHaveTextContent(en.desktopUpdate.failed)
  storage.mockRestore()
  await click(en.common.retry)
  expect(reload).toHaveBeenCalledOnce()
})

it('restores the account-bound conversation after a process restart through the rendered account seed', async () => {
  const chat = { ...useChatStore.getState(), draft: 'After the restart' }
  await retireHeldAccount()
  await writeDesktopChatCheckpoint('desktop-account', chat, true, true)
  sessionStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async () => GET()))
  render(<NextIntlClientProvider locale="en" messages={en}>
    <RenderedAccountSeed accountId="desktop-account"><Providers><p>Hoje</p></Providers></RenderedAccountSeed>
  </NextIntlClientProvider>)
  await tick()
  expect(useChatStore.getState().draft).toBe('After the restart')
  expect(useUIStore.getState().astraConversationOpen).toBe(true)
  expect(takeDesktopChatCheckpoint('desktop-account')).toBeNull()
})

it('keeps a failed shell install retryable and discards its stale checkpoint', async () => {
  native.phase = 'downloaded'
  native.shellVersion = '0.2.0'
  const original = invoke.getMockImplementation()!
  let attempts = 0
  invoke.mockImplementation(async (command, payload) => {
    if (payload.action === 'install' && attempts++ === 0) {
      native.phase = 'failed'
      return { ...native }
    }
    return original(command, payload)
  })
  mount()
  await tick()
  await click(en.versionUpdate.restartCta)
  expect(screen.getByRole('status')).toHaveTextContent(en.desktopUpdate.failed)
  expect(localStorage.getItem('orbit-desktop-web-reload')).toBeNull()
  expect(actions().filter(action => action === 'download')).toHaveLength(1)
  await click(en.common.retry)
  expect(attempts).toBe(2)
  expect(native.phase).toBe('installing')
})

it('clears the native web menu offer after the new build has loaded', async () => {
  native.webCommit = currentCommit
  mount()
  await tick()
  expect(native.webCommit).toBeNull()
  expect(screen.queryByRole('button', { name: en.versionUpdate.restartCta })).toBeNull()
})

it('the native Update available item reveals a deferred notice without restarting', async () => {
  vi.stubEnv('WEB_COMMIT_SHA', nextCommit)
  mount()
  await tick()
  await click(en.versionUpdate.laterCta)
  expect(native.deferred).toBe(true)
  native.deferred = false
  await tick()
  expect(screen.getByRole('button', { name: en.versionUpdate.restartCta })).toBeVisible()
  expect(reload).not.toHaveBeenCalled()
  expect(actions()).not.toContain('download')
  expect(actions()).not.toContain('install')
})
