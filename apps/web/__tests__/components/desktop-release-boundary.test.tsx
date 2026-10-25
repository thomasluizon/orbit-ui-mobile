import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { makeHeldHabitMessage } from '@orbit/shared/test-support/chat-fixtures'
import { DesktopReleaseBoundary } from '@/components/desktop-release-boundary'
import { Providers } from '@/lib/providers'
import { writeDesktopChatCheckpoint } from '@/lib/desktop-chat-checkpoint'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'
import { holdAccount } from '@/__tests__/support/account-change'
import { GET } from '@/app/api/desktop-release/route'

vi.mock('@/lib/posthog', () => ({ identifyPostHogUser: vi.fn(), resetPostHogUser: vi.fn() }))
vi.mock('@/components/service-worker-bridge', () => ({ ServiceWorkerBridge: () => null }))

beforeEach(() => {
  sessionStorage.clear()
  holdAccount('desktop-account')
  useChatStore.setState(useChatStore.getInitialState())
  useUIStore.setState(useUIStore.getInitialState())
  vi.stubGlobal('fetch', vi.fn(async () => GET()))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

function Conversation() {
  const messages = useChatStore(state => state.messages)
  const draft = useChatStore(state => state.draft)
  const open = useUIStore(state => state.astraConversationOpen)
  return <section aria-label="Astra" hidden={!open}>
    {messages.map(message => <p key={message.id}>{message.content}</p>)}
    <textarea aria-label="Draft" value={draft} readOnly />
  </section>
}

it.each([{ locale: 'en', messages: en }, { locale: 'pt-BR', messages: ptBR }])(
  'blocks an incompatible shell before mounting the application in $locale', ({ locale, messages }) => {
    vi.stubGlobal('__TAURI_INTERNALS__', {})
    vi.stubGlobal('__ORBIT_DESKTOP_VERSION__', '0.1.2')
    const mounted = vi.fn()
    function Application() { mounted(); return <p>Hoje</p> }
    render(<NextIntlClientProvider locale={locale} messages={messages}>
      <DesktopReleaseBoundary minimum="0.2.0"><Application /></DesktopReleaseBoundary>
    </NextIntlClientProvider>)
    expect(screen.getByRole('alert')).toHaveTextContent(messages.desktopUpdate.required)
    expect(mounted).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  },
)

it('keeps browser sessions outside the shell gate, and requires updates for undiscoverable legacy shells at a raised floor', () => {
  const { unmount } = render(<NextIntlClientProvider locale="en" messages={en}>
    <DesktopReleaseBoundary minimum="1.0.0"><p>Hoje</p></DesktopReleaseBoundary>
  </NextIntlClientProvider>)
  expect(screen.getByText('Hoje')).toBeVisible()
  unmount()
  vi.stubGlobal('__TAURI_INTERNALS__', {})
  render(<NextIntlClientProvider locale="en" messages={en}>
    <DesktopReleaseBoundary minimum="1.0.0"><p>Hoje</p></DesktopReleaseBoundary>
  </NextIntlClientProvider>)
  expect(screen.queryByText('Hoje')).toBeNull()
  expect(screen.getByRole('alert')).toHaveTextContent(en.desktopUpdate.required)
})

it('restores structured Astra state and visibility through the real provider composition after reload', async () => {
  vi.stubGlobal('__TAURI_INTERNALS__', {})
  vi.stubGlobal('__ORBIT_DESKTOP_VERSION__', '0.1.2')
  const message = makeHeldHabitMessage({ content: 'Your planned habits' })
  useChatStore.setState({ messages: [message], draft: 'And tomorrow?', proactiveOutcomes: { reminder: 'acted' } })
  await writeDesktopChatCheckpoint('desktop-account', useChatStore.getState(), true)
  useChatStore.setState(useChatStore.getInitialState())
  render(<NextIntlClientProvider locale="en" messages={en}>
    <Providers><Conversation /></Providers>
  </NextIntlClientProvider>)
  expect(screen.getByRole('region', { name: 'Astra' })).toBeVisible()
  expect(screen.getByText('Your planned habits')).toBeVisible()
  expect(screen.getByRole('textbox', { name: 'Draft' })).toHaveValue('And tomorrow?')
  expect(useChatStore.getState().messages[0]).toEqual(message)
  expect(useChatStore.getState().proactiveOutcomes).toEqual({ reminder: 'acted' })
  expect(sessionStorage.length).toBe(0)
})

it('turns a newly raised floor into the update path without reloading or losing the open conversation', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('__TAURI_INTERNALS__', {})
  vi.stubGlobal('__ORBIT_DESKTOP_VERSION__', '0.1.2')
  const reload = vi.fn()
  vi.stubGlobal('location', { reload })
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ...await GET().json(), minimumShellVersion: '0.2.0' })))
  useChatStore.setState({ messages: [makeHeldHabitMessage()], isTyping: true })
  render(<NextIntlClientProvider locale="en" messages={en}><Providers><p>Hoje</p></Providers></NextIntlClientProvider>)
  await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
  expect(screen.getByText('Hoje')).toBeVisible()
  expect(screen.queryByRole('alert')).toBeNull()
  await act(async () => {
    useChatStore.getState().setIsTyping(false)
    await vi.advanceTimersByTimeAsync(2000)
  })
  expect(screen.queryByText('Hoje')).toBeNull()
  expect(screen.getByRole('alert')).toHaveTextContent(en.desktopUpdate.required)
  expect(reload).not.toHaveBeenCalled()
  expect(sessionStorage.length).toBe(1)
})
