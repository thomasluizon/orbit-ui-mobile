import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import { renderToString } from 'react-dom/server'
import { hydrateRoot } from 'react-dom/client'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import shellEn from '../../../desktop/locales/en.json'
import shellPtBR from '../../../desktop/locales/pt-BR.json'
import { makeHeldHabitMessage } from '@orbit/shared/test-support/chat-fixtures'
import { UpdateAvailableBanner } from '@/components/ui/update-available-banner'
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

it.each([false, true])('renders application children on the server with shell discovery %s', shell => {
  if (shell) {
    vi.stubGlobal('__TAURI_INTERNALS__', {})
    vi.stubGlobal('__ORBIT_DESKTOP_VERSION__', '0.1.2')
  }
  const html = renderToString(<NextIntlClientProvider locale="en" messages={en}>
    <DesktopReleaseBoundary minimum="1.0.0"><Providers><p>Hoje</p></Providers></DesktopReleaseBoundary>
  </NextIntlClientProvider>)
  expect(html).toContain('<p>Hoje</p>')
  expect(html).not.toContain(en.desktopUpdate.required)
})

it.each([false, true])('preserves server input through compatible hydration with shell discovery %s', async shell => {
  const application = <NextIntlClientProvider locale="en" messages={en}>
    <DesktopReleaseBoundary minimum="0.0.0" monitor><input aria-label="Habit" defaultValue="" /></DesktopReleaseBoundary>
  </NextIntlClientProvider>
  const container = document.createElement('div')
  container.innerHTML = renderToString(application)
  document.body.append(container)
  const input = screen.getByRole('textbox', { name: 'Habit' })
  expect(input).toBeInstanceOf(HTMLInputElement)
  if (!(input instanceof HTMLInputElement)) throw new Error('Expected the server-rendered habit input')
  input.value = 'Drink water'
  if (shell) {
    vi.stubGlobal('__TAURI_INTERNALS__', {})
    vi.stubGlobal('__ORBIT_DESKTOP_VERSION__', '0.1.2')
  }
  const onRecoverableError = vi.fn()
  const root = hydrateRoot(container, application, { onRecoverableError })
  try {
    await act(async () => {})
    if (shell) {
      await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/desktop-release', expect.objectContaining({ cache: 'no-store' })))
    } else {
      expect(fetch).not.toHaveBeenCalled()
    }
    expect(input).toHaveValue('Drink water')
    expect(screen.getByRole('textbox', { name: 'Habit' })).toBe(input)
    expect(onRecoverableError).not.toHaveBeenCalled()
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})

it('hydrates server children before showing an incompatible shell update without a mismatch', async () => {
  const application = <NextIntlClientProvider locale="en" messages={en}>
    <DesktopReleaseBoundary minimum="1.0.0"><p>Hoje</p></DesktopReleaseBoundary>
  </NextIntlClientProvider>
  const container = document.createElement('div')
  container.innerHTML = renderToString(application)
  expect(container).toHaveTextContent('Hoje')
  document.body.append(container)
  vi.stubGlobal('__TAURI_INTERNALS__', {})
  vi.stubGlobal('__ORBIT_DESKTOP_VERSION__', '0.1.2')
  const onRecoverableError = vi.fn()
  const root = hydrateRoot(container, application, { onRecoverableError })
  try {
    await act(async () => {})
    await waitFor(() => expect(container).toHaveTextContent(en.desktopUpdate.required))
    expect(onRecoverableError).not.toHaveBeenCalled()
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})

it.each([{ messages: en, shell: shellEn }, { messages: ptBR, shell: shellPtBR }])(
  'names the installed shell update menu actions in the page copy', ({ messages, shell }) => {
    expect(messages.desktopUpdate.required).toContain(shell.updateCheck)
    expect(messages.desktopUpdate.required).toContain(shell.updateRestart)
  },
)

it.each([{ locale: 'en', messages: en }, { locale: 'pt-BR', messages: ptBR }])(
  'replaces the application with the update path for an incompatible shell in $locale', async ({ locale, messages }) => {
    vi.stubGlobal('__TAURI_INTERNALS__', {})
    vi.stubGlobal('__ORBIT_DESKTOP_VERSION__', '0.1.2')
    render(<NextIntlClientProvider locale={locale} messages={messages}>
      <DesktopReleaseBoundary minimum="0.2.0"><p>Hoje</p></DesktopReleaseBoundary>
    </NextIntlClientProvider>)
    expect(await screen.findByRole('alert')).toHaveTextContent(messages.desktopUpdate.required)
    expect(screen.queryByText('Hoje')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  },
)

it('keeps browser sessions outside the shell gate, and requires updates for undiscoverable legacy shells at a raised floor', async () => {
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
  expect(await screen.findByRole('alert')).toHaveTextContent(en.desktopUpdate.required)
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
  expect(await screen.findByRole('region', { name: 'Astra' })).toBeVisible()
  expect(screen.getByText('Your planned habits')).toBeVisible()
  expect(screen.getByRole('textbox', { name: 'Draft' })).toHaveValue('And tomorrow?')
  expect(useChatStore.getState().messages[0]).toEqual(message)
  expect(useChatStore.getState().proactiveOutcomes).toEqual({ reminder: 'acted' })
  expect(sessionStorage.length).toBe(0)
})

it('offers a newly raised floor and preserves the conversation until Restart is chosen', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('__TAURI_INTERNALS__', {})
  vi.stubGlobal('__ORBIT_DESKTOP_VERSION__', '0.1.2')
  const reload = vi.fn()
  vi.stubGlobal('location', { reload })
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ...await GET().json(), minimumShellVersion: '0.2.0' })))
  useChatStore.setState({ messages: [makeHeldHabitMessage()], isTyping: true })
  render(<NextIntlClientProvider locale="en" messages={en}><Providers><p>Hoje</p><UpdateAvailableBanner /></Providers></NextIntlClientProvider>)
  await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
  expect(screen.getByText('Hoje')).toBeVisible()
  expect(screen.queryByRole('alert')).toBeNull()
  await act(async () => {
    useChatStore.getState().setIsTyping(false)
    await vi.advanceTimersByTimeAsync(2000)
  })
  expect(screen.getByText('Hoje')).toBeVisible()
  expect(screen.queryByRole('alert')).toBeNull()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: en.versionUpdate.restartCta })) })
  expect(screen.queryByText('Hoje')).toBeNull()
  expect(screen.getByRole('alert')).toHaveTextContent(en.desktopUpdate.required)
  expect(reload).not.toHaveBeenCalled()
  expect(sessionStorage.length).toBe(1)
})
