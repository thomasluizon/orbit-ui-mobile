import React from 'react'
import { Text } from 'react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import { API } from '@orbit/shared/api'
import { createNotionAuthorization, createNotionConnection } from '@orbit/shared/__tests__/notion-fixtures'
import { AstraConnections } from '@/components/profile/astra-connections'
import { NotionConnectionSheet } from '@/components/profile/notion-connection-sheet'
import { useNotionConnectionController } from '@/components/profile/astra-settings-controller'
import { ListRow } from '@/components/ui/list-row'
import { PillButton } from '@/components/ui/pill-button'
import { getAccountGeneration } from '@/lib/session-epoch'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'

const TestRenderer = require('react-test-renderer')
const mocks = vi.hoisted(() => ({ enabled: true, online: true, push: vi.fn(), api: vi.fn() }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: mocks.push }), useLocalSearchParams: () => ({}) }))
vi.mock('react-i18next', async (original) => ({ ...await original<typeof import('react-i18next')>(), useTranslation: () => ({ t: (key: string, values?: Record<string, string>) => {
  let value: unknown = en
  for (const segment of key.split('.')) value = (value as Record<string, unknown>)[segment]
  return values ? String(value).replace('{time}', values.time ?? '') : String(value)
}, i18n: { language: 'en' } }) }))
vi.mock('@/hooks/use-config', () => ({ useConfig: () => ({ config: { features: { notion_integration: { enabled: mocks.enabled } } } }) }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: mocks.online }) }))
vi.mock('@/lib/api-client', () => ({ apiClient: mocks.api }))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

let tree: ReturnType<typeof TestRenderer.create>
const clients: QueryClient[] = []
function mount(pro = true, child?: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(client)
  TestRenderer.act(() => { tree = TestRenderer.create(<QueryClientProvider client={client}>{child ?? <AstraConnections hasProAccess={pro} />}</QueryClientProvider>) })
}
function row(title: string) { return tree.root.findAllByType(ListRow).find((node: { props: { title: string } }) => node.props.title === title)! }
function action(label: string) { return tree.root.findAllByType(PillButton).find((node: { props: { children: string } }) => node.props.children === label)! }
function text() { return tree.root.findAllByType(Text).map((node: { props: { children: React.ReactNode } }) => node.props.children).flat().join(' ') }
async function settle() { await TestRenderer.act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)) }) }
async function openNotion() { await settle(); TestRenderer.act(() => row('Notion').props.onClick()); await settle() }
beforeEach(() => {
  mocks.enabled = true; mocks.online = true; vi.clearAllMocks()
  mocks.api.mockImplementation((path: string, options?: { method?: string }) => {
    if (path === API.connections.notionAuthorize) return Promise.resolve(createNotionAuthorization())
    if (options?.method === 'DELETE') return Promise.resolve(undefined)
    return Promise.resolve(createNotionConnection())
  })
})
afterEach(() => { TestRenderer.act(() => tree?.unmount()); clients.splice(0).forEach((client) => client.clear()) })
it('opens the calendar sheet route and omits Notion when disabled', () => {
  mocks.enabled = false; mount()
  TestRenderer.act(() => row(en.profile.connections.googleCalendar).props.onClick())
  expect(mocks.push).toHaveBeenCalledWith('/calendar?import=1')
  expect(row('Notion')).toBeUndefined()
  expect(mocks.api).not.toHaveBeenCalledWith(API.connections.notion, expect.anything(), expect.anything())
})
it('uses the Pro lock without reading Notion for free accounts', () => {
  mount(false); TestRenderer.act(() => row('Notion').props.onClick())
  expect(mocks.push).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/upgrade' }))
  expect(tree.root.findAllByType(NotionConnectionSheet)).toHaveLength(0)
  expect(mocks.api).not.toHaveBeenCalledWith(API.connections.notion, expect.anything(), expect.anything())
})
it('keeps Connect and its spinner while requesting authorization', async () => {
  mocks.api.mockImplementation((path: string) => path === API.connections.notionAuthorize ? new Promise(() => {}) : Promise.resolve(createNotionConnection()))
  mount(); await openNotion()
  expect(text()).toContain(en.profile.connections.description)
  TestRenderer.act(() => action(en.profile.connections.connect).props.onClick()); await settle()
  expect(action(en.profile.connections.connect).props.loading).toBe(true)
  expect(mocks.api).toHaveBeenCalledWith(API.connections.notionAuthorize, expect.objectContaining({ method: 'POST', body: JSON.stringify({ redirectUri: 'https://app.useorbit.org/auth-callback/notion' }) }), expect.anything())
})
it.each(['connect', 'choosePages', 'reconnect'] as const)('opens the %s URL after native dismissal completes', async (mode) => {
  mocks.api.mockImplementation((path: string) => Promise.resolve(path === API.connections.notionAuthorize ? createNotionAuthorization() : createNotionConnection({ connected: mode === 'choosePages', status: mode === 'reconnect' ? 'ReconnectRequired' : 'Idle' })))
  const opened = vi.fn(); const closed = vi.fn()
  function Harness() {
    const controller = useNotionConnectionController(true)
    return <NotionConnectionSheet callbackFailed={false} controller={controller} onClose={closed}
      onAuthorize={(ready) => controller.authorize.mutate(getAccountGeneration(), { onSuccess: (response) => ready(response.authorizeUrl) })} onOpenUrl={opened} />
  }
  const { sheetTestControls } = await import('@/__tests__/support/sheet-double')
  mount(true, <Harness />); await settle(); sheetTestControls.defer(true)
  TestRenderer.act(() => action(en.profile.connections[mode]).props.onClick()); await settle()
  expect(sheetTestControls.isDismissPending).toBe(true); expect(opened).not.toHaveBeenCalled()
  TestRenderer.act(() => sheetTestControls.completeDismissal())
  expect(closed).toHaveBeenCalledOnce()
  expect(opened).toHaveBeenCalledExactlyOnceWith(createNotionAuthorization().authorizeUrl)
  sheetTestControls.defer(false)
})
it('shows the workspace and last sync, then deletes only after confirmation', async () => {
  let disconnected = false
  let finishDisconnect!: () => void
  const pendingDelete = new Promise<void>((resolve) => { finishDisconnect = resolve })
  mocks.api.mockImplementation(async (_path: string, options?: { method?: string }) => {
    await Promise.resolve()
    if (options?.method === 'DELETE') { await pendingDelete; disconnected = true; return undefined }
    return disconnected ? createNotionConnection() : createNotionConnection({ connected: true, workspaceName: 'Shared tasks', lastPollAtUtc: '2026-10-17T12:00:00Z' })
  })
  mount(); await openNotion()
  expect(text()).toContain('Shared tasks'); expect(text()).toContain('Last sync:')
  expect(action(en.profile.connections.choosePages).props.disabled).toBe(false)
  TestRenderer.act(() => action(en.profile.connections.disconnect).props.onClick())
  const confirmation = tree.root.findByType(ConfirmSheet)
  expect(confirmation.props.open).toBe(true)
  expect(text()).toContain(en.profile.connections.disconnectBody)
  expect(disconnected).toBe(false)
  const confirm = confirmation.findAllByType(PillButton).find((node: { props: { children: string } }) => node.props.children === en.profile.connections.disconnect)!
  TestRenderer.act(() => confirm.props.onClick()); await settle()
  expect(mocks.api.mock.calls.filter((call: unknown[]) => (call[1] as { method?: string } | undefined)?.method === 'DELETE')).toHaveLength(1)
  expect(action(en.profile.connections.disconnect).props.loading).toBe(true)
  await TestRenderer.act(async () => { finishDisconnect(); await pendingDelete }); await settle()
  expect(row('Notion').props.value).toBe(en.profile.connections.notConnected)
})
it('offers Reconnect for expired authorization', async () => {
  mocks.api.mockResolvedValue(createNotionConnection({ status: 'ReconnectRequired', workspaceName: 'Shared tasks' }))
  mount(); await openNotion()
  expect(row('Notion').props.value).toBe(en.profile.connections.renew)
  expect(action(en.profile.connections.reconnect).props.disabled).toBe(false)
})
it('disables offline actions and exposes the reason', async () => {
  mocks.online = false; mount(); await openNotion()
  expect(action(en.profile.connections.connect).props.disabled).toBe(true)
  expect(text()).toContain(en.profile.connections.offline)
  expect(mocks.api).not.toHaveBeenCalledWith(API.connections.notion, expect.anything(), expect.anything())
})
it('shows an authorization failure and allows another attempt', async () => {
  mocks.api.mockImplementation(async (path: string) => { await Promise.resolve(); if (path === API.connections.notionAuthorize) throw new Error('Unavailable'); return createNotionConnection() })
  mount(); await openNotion()
  TestRenderer.act(() => action(en.profile.connections.connect).props.onClick()); await settle()
  expect(text()).toContain(en.profile.connections.error)
  expect(action(en.profile.connections.connect).props.disabled).toBe(false)
})
