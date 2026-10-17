import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createTranslator } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { API } from '@orbit/shared/api'
import { createNotionAuthorization, createNotionConnection } from '@orbit/shared/__tests__/notion-fixtures'
import { useAuthStore } from '@/stores/auth-store'
import { AstraConnections } from '@/components/profile/astra-connections'
import { NotionConnectionSheet } from '@/components/profile/notion-connection-sheet'
import { useNotionConnectionController } from '@/components/profile/astra-settings-controller'

const mocks = vi.hoisted(() => ({ enabled: true, online: true, locale: 'en', push: vi.fn(), authorize: vi.fn(), disconnect: vi.fn(), fetch: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }), useSearchParams: () => new URLSearchParams() }))
vi.mock('next-intl', async (original) => ({ ...await original<typeof import('next-intl')>(), useLocale: () => mocks.locale,
  useTranslations: () => createTranslator({ locale: mocks.locale, messages: mocks.locale === 'en' ? en : ptBR }) }))
vi.mock('@/hooks/use-config', () => ({ useConfig: () => ({ config: { features: { notion_integration: { enabled: mocks.enabled } } } }) }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: mocks.online }) }))
vi.mock('@/lib/actions/profile', () => ({ authorizeNotion: mocks.authorize, disconnectNotion: mocks.disconnect }))
vi.mock('@/lib/throttle-fetch', () => ({ fetchWithThrottle: mocks.fetch }))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

beforeEach(() => {
  mocks.enabled = true; mocks.online = true; mocks.locale = 'en'
  vi.clearAllMocks()
  useAuthStore.getState().setAuth({ userId: 'account-a', name: 'Account', email: 'account@example.com' })
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => createNotionConnection() })
  mocks.authorize.mockResolvedValue(createNotionAuthorization())
  mocks.disconnect.mockResolvedValue(undefined)
})
afterEach(cleanup)
function mount(pro = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><AstraConnections hasProAccess={pro} /></QueryClientProvider>)
}
async function openNotion() {
  await screen.findByText(en.profile.connections.notConnected)
  fireEvent.click(screen.getByRole('button', { name: /Notion/ }))
}
it('opens the existing calendar sheet route and hides Notion when disabled', () => {
  mocks.enabled = false; mount()
  expect(screen.getByRole('link', { name: en.profile.connections.googleCalendar })).toHaveAttribute('href', '/calendar?import=1')
  expect(screen.queryByText('Notion')).not.toBeInTheDocument()
  expect(mocks.fetch).not.toHaveBeenCalled()
})
it('locks Notion for a free account without loading its connection', () => {
  mount(false)
  fireEvent.click(screen.getByRole('button', { name: /Notion/ }))
  expect(mocks.push).toHaveBeenCalledWith('/upgrade?from=%2Fprofile%2Fastra')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(mocks.fetch).not.toHaveBeenCalled()
})
it('retains Connect and shows its spinner while requesting authorization', async () => {
  mocks.authorize.mockReturnValue(new Promise(() => {}))
  mount(); await openNotion()
  expect(screen.getByText(en.profile.connections.description)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: en.profile.connections.connect }))
  await waitFor(() => expect(screen.getByRole('button', { name: en.profile.connections.connect })).toHaveAttribute('aria-busy', 'true'))
  expect(mocks.authorize).toHaveBeenCalledExactlyOnceWith({ redirectUri: `${window.location.origin}/auth-callback/notion` }, 'account-a')
  expect(mocks.fetch).toHaveBeenCalledWith(API.connections.notion)
})
it.each(['connect', 'choosePages', 'reconnect'] as const)('opens the %s URL only after closing the sheet', async (mode) => {
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => createNotionConnection({ connected: mode === 'choosePages', status: mode === 'reconnect' ? 'ReconnectRequired' : 'Idle' }) })
  const opened = vi.fn()
  const closed = vi.fn()
  function Harness() {
    const controller = useNotionConnectionController(true)
    return <NotionConnectionSheet callbackFailed={false} controller={controller} onClose={closed}
      onAuthorize={(ready) => controller.authorize.mutate(undefined, { onSuccess: (response) => ready(response.authorizeUrl) })} onOpenUrl={opened} />
  }
  const { sheetTestControls } = await import('@/__tests__/support/sheet-double')
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>)
  await waitFor(() => expect(screen.getByRole('button', { name: en.profile.connections[mode] })).toBeEnabled())
  sheetTestControls.defer(true)
  fireEvent.click(screen.getByRole('button', { name: en.profile.connections[mode] }))
  await waitFor(() => expect(sheetTestControls.isDismissPending).toBe(true))
  expect(opened).not.toHaveBeenCalled()
  act(() => sheetTestControls.completeDismissal())
  expect(closed).toHaveBeenCalledOnce()
  expect(opened).toHaveBeenCalledExactlyOnceWith(createNotionAuthorization().authorizeUrl)
  sheetTestControls.defer(false)
})
it('shows workspace, sync time and page picker, then confirms one disconnect', async () => {
  let finishDisconnect!: () => void
  mocks.disconnect.mockReturnValue(new Promise<void>((resolve) => { finishDisconnect = resolve }))
  mocks.fetch.mockResolvedValueOnce({ ok: true, json: async () => createNotionConnection({ connected: true, workspaceName: 'Shared tasks', lastPollAtUtc: '2026-10-17T12:00:00Z' }) })
  mount()
  await screen.findByText(en.profile.connections.connected)
  fireEvent.click(screen.getByRole('button', { name: /Notion/ }))
  expect(screen.getByRole('button', { name: 'Shared tasks' })).toBeInTheDocument()
  expect(document.body).toHaveTextContent('Shared tasks')
  fireEvent.click(screen.getByRole('button', { name: 'Shared tasks' }))
  expect(screen.getByRole('button', { name: 'Shared tasks' })).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByText(/Last sync:/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: en.profile.connections.choosePages })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: en.profile.connections.disconnect }))
  const confirmation = screen.getByRole('dialog', { name: en.profile.connections.disconnectTitle })
  expect(within(confirmation).getByText(en.profile.connections.disconnectBody)).toBeInTheDocument()
  expect(mocks.disconnect).not.toHaveBeenCalled()
  fireEvent.click(within(confirmation).getByRole('button', { name: en.profile.connections.disconnect }))
  await waitFor(() => expect(mocks.disconnect).toHaveBeenCalledExactlyOnceWith('account-a'))
  expect(screen.getByRole('button', { name: en.profile.connections.disconnect })).toHaveAttribute('aria-busy', 'true')
  await act(async () => finishDisconnect())
  await screen.findByText(en.profile.connections.notConnected)
})
it('shows Reconnect for an expired connection', async () => {
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => createNotionConnection({ status: 'ReconnectRequired', workspaceName: 'Shared tasks' }) })
  mount(); await screen.findByText(en.profile.connections.renew)
  fireEvent.click(screen.getByRole('button', { name: /Notion/ }))
  expect(screen.getByRole('button', { name: en.profile.connections.reconnect })).toBeEnabled()
})
it('disables offline actions with a reason and keeps failures visible', async () => {
  mocks.online = false; mount()
  fireEvent.click(screen.getByRole('button', { name: /Notion/ }))
  expect(screen.getByRole('button', { name: en.profile.connections.connect })).toBeDisabled()
  expect(screen.getByText(en.profile.connections.offline)).toBeInTheDocument()
  cleanup(); mocks.online = true; mocks.authorize.mockRejectedValue(new Error('Unavailable'))
  mount(); await openNotion()
  fireEvent.click(screen.getByRole('button', { name: en.profile.connections.connect }))
  await screen.findByText(en.profile.connections.error)
  expect(screen.getByRole('button', { name: en.profile.connections.connect })).toBeEnabled()
})
it('keeps an unavailable connection retryable', async () => {
  mocks.fetch.mockResolvedValue({ ok: false, status: 403 })
  mount(); await screen.findByText(en.profile.connections.error)
  fireEvent.click(screen.getByRole('button', { name: /Notion/ }))
  expect(screen.getByRole('button', { name: en.common.retry })).toBeEnabled()
  expect(screen.queryByRole('button', { name: en.profile.connections.connect })).not.toBeInTheDocument()
})
