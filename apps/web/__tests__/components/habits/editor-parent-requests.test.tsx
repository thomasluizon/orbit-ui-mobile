import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import { checklistTemplateKeys, goalKeys, habitKeys, tagKeys } from '@orbit/shared/query'
import { createMockHabit, createMockHabitScheduleItem } from '@orbit/shared/__tests__/factories'
import { EditHabitModal } from '@/components/habits/edit-habit-modal'

const transport = vi.hoisted(() => ({
  attempted: [] as { endpoint: string; method: string; body: unknown }[],
  read: vi.fn(),
  mutate: vi.fn(),
}))
vi.mock('@/lib/server-fetch', () => ({ serverAuthMutate: transport.mutate, serverAuthFetch: transport.read }))
vi.mock('@/lib/api-fetch', async (original) => ({ ...await original<typeof import('@/lib/api-fetch')>(), fetchJson: transport.read }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useLocale: () => 'en' }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), unstable_isUnrecognizedActionError: () => false }))
vi.mock('@/hooks/use-profile', () => ({ useHasProAccess: () => true, useProfile: () => ({ profile: { hasProAccess: true, uses24HourClock: true, timeZone: 'UTC', weekStartDay: 1, language: 'en' } }) }))
vi.mock('@/hooks/use-config', async () => { const { DEFAULT_CONFIG } = await import('@orbit/shared/types/config'); return { useConfig: () => ({ config: DEFAULT_CONFIG }) } })
vi.mock('@/hooks/use-reminder-permission', () => ({ useReminderPermission: () => ({ requestPermission: vi.fn(), toggleReminder: vi.fn(), showNotice: false }) }))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

afterEach(() => { vi.unstubAllGlobals() })

it.each([false, true])('journals complete editor writes and retries against fresh authority: uncertain retry %s', async (retryUncertain) => {
  const parentId = '22222222-2222-4222-8222-222222222222'
  const source = createMockHabit({
    id: '11111111-1111-4111-8111-111111111111', title: 'Read', frequencyUnit: 'Day',
    startDate: '2026-08-20', tags: [], linkedGoals: [], slipAlertEnabled: false,
    checklistItems: [{ text: 'Same', isChecked: true }, { text: 'Same', isChecked: false }],
  })
  const detail = { ...source, parentId: null, children: [] }
  const items = [createMockHabitScheduleItem({ ...source, children: [] }), createMockHabitScheduleItem({ id: parentId, title: 'Off-day destination', children: [] })]
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  client.setQueryData(habitKeys.detail(source.id), detail)
  client.setQueryData(habitKeys.list({}), items)
  client.setQueryData(habitKeys.list({ isGeneral: true }), [])
  client.setQueryData(tagKeys.lists(), [])
  client.setQueryData(goalKeys.lists(), [])
  client.setQueryData(checklistTemplateKeys.lists(), [])
  transport.attempted = []
  const record = (endpoint: string, options?: RequestInit) => {
    const method = options?.method ?? 'GET'
    if (method !== 'GET' && method !== 'HEAD') transport.attempted.push({ endpoint, method, body: options?.body })
  }
  transport.mutate.mockReset().mockImplementation(async (endpoint: string, options?: RequestInit) => { record(endpoint, options) })
  transport.read.mockReset().mockImplementation(async (endpoint: string, options?: RequestInit) => {
    record(endpoint, options)
    if (endpoint === API.habits.get(source.id)) return detail
    if (endpoint.startsWith(API.habits.list)) return { items: endpoint.includes('isGeneral=true') ? [] : items, page: 1, pageSize: 200, totalCount: 2, totalPages: 1 }
    if (endpoint === API.goals.list) return []
    return []
  })
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, options?: RequestInit) => {
    transport.attempted.push({
      endpoint: input instanceof Request ? input.url : String(input),
      method: options?.method ?? (input instanceof Request ? input.method : 'GET'),
      body: options?.body ?? (input instanceof Request ? await input.clone().text() : undefined),
    })
    throw new Error('Unexpected direct transport')
  })
  const onClose = vi.fn()
  const onSaved = vi.fn()
  const element = (open: boolean) => <QueryClientProvider client={client}><EditHabitModal open={open} habit={source} onOpenChange={onClose} onSaved={onSaved} /></QueryClientProvider>
  const view = render(element(true))
  try {
    const field = () => screen.getByRole('button', { name: /habits.form.parentHabit/ })
    const choose = async () => {
      fireEvent.click(field())
      const picker = await screen.findByRole('dialog', { name: 'habits.form.parentHabit' })
      await act(async () => fireEvent.click(within(picker).getByRole('radio', { name: /Off-day destination/ })))
      expect(transport.attempted).toEqual([])
      await act(async () => fireEvent.click(within(picker).getByRole('button', { name: 'close-overlay' })))
      expect(transport.attempted).toEqual([])
    }
    expect(screen.getByRole('button', { name: 'common.save' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'common.cancel' })).toBeVisible()
    expect(screen.getAllByRole('textbox', { name: 'habits.form.checklistItemLabel' })).toHaveLength(2)
    await choose()
    expect(field()).toHaveTextContent('Off-day destination')
    if (retryUncertain) {
      let persistedParent: string | null = null
      let readsFail = true
      transport.read.mockImplementation(async (endpoint: string, options?: RequestInit) => {
        record(endpoint, options)
        if (endpoint === API.habits.get(source.id)) {
          if (readsFail) throw new Error('Readback unavailable')
          return { ...detail, parentId: persistedParent }
        }
        if (endpoint.startsWith(API.habits.list)) return { items: endpoint.includes('isGeneral=true') ? [] : items, page: 1, pageSize: 200, totalCount: 2, totalPages: 1 }
        return []
      })
      transport.mutate.mockImplementation(async (endpoint: string, options?: RequestInit) => {
        record(endpoint, options)
        const request = JSON.parse(options!.body as string)
        if (request.clearParent) persistedParent = null
        else if (request.parentId) persistedParent = request.parentId
        if (transport.attempted.length === 1) throw new Error('Response lost')
      })
      await act(async () => fireEvent.click(screen.getByRole('button', { name: 'common.save' })))
      expect(await screen.findByText('habits.form.saveUncertain')).toBeVisible()
      expect(persistedParent).toBe(parentId)
      expect(onSaved).not.toHaveBeenCalled()
      expect(client.getQueryData(habitKeys.detail(source.id))).toMatchObject({ parentId: null })
      fireEvent.click(field())
      const picker = await screen.findByRole('dialog', { name: 'habits.form.parentHabit' })
      await act(async () => fireEvent.click(within(picker).getByRole('radio', { name: /habits.moveParent.toRoot/ })))
      await act(async () => fireEvent.click(within(picker).getByRole('button', { name: 'close-overlay' })))
      expect(field()).toHaveTextContent('habits.moveParent.toRoot')
      expect(transport.attempted).toHaveLength(1)
      readsFail = false
      await act(async () => fireEvent.click(screen.getByRole('button', { name: 'common.save' })))
      await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
      expect(transport.attempted).toHaveLength(2)
      expect(transport.attempted.every((write) => write.method === 'PUT' && write.endpoint === API.habits.update(source.id))).toBe(true)
      expect(JSON.parse(transport.attempted[1]!.body as string)).toMatchObject({ clearParent: true, checklistItems: source.checklistItems, tagIds: [], goalIds: [] })
      expect(persistedParent).toBeNull()
      return
    }
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'common.discardChangesAction' }))
    expect(onClose).toHaveBeenCalledExactlyOnceWith(false)
    expect(transport.attempted).toEqual([])
    view.rerender(element(false))
    view.rerender(element(true))
    expect(field()).toHaveTextContent('habits.moveParent.toRoot')
    await choose()
    fireEvent.change(screen.getByRole('textbox', { name: 'habits.form.describe' }), { target: { value: 'Read together' } })
    expect(transport.attempted).toEqual([])
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'common.save' })))
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
    expect(transport.attempted).toEqual([{ endpoint: API.habits.update(source.id), method: 'PUT', body: expect.any(String) }])
    expect(JSON.parse(transport.attempted[0]!.body as string)).toMatchObject({ title: 'Read together', parentId, checklistItems: source.checklistItems, goalIds: [], tagIds: [], startDate: source.startDate })
  } finally {
    view.unmount()
    client.clear()
  }
})
