import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactTestRenderer } from 'react-test-renderer'
import { expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import { checklistTemplateKeys, goalKeys, habitKeys, tagKeys } from '@orbit/shared/query'
import { createMockHabit, createMockHabitScheduleItem } from '@orbit/shared/__tests__/factories'
import { EditHabitModal } from '@/components/habits/edit-habit-modal'
import { ListRow } from '@/components/ui/list-row'
import { PillButton } from '@/components/ui/pill-button'
import { RadioRow } from '@/components/ui/select-check'

const { act, create } = require('react-test-renderer') as typeof import('react-test-renderer')
const transport = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('@/lib/api-client', () => ({ apiClient: transport.request }))
vi.mock('expo-crypto', () => ({ randomUUID: () => '33333333-3333-4333-8333-333333333333' }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/use-profile', () => ({ useHasProAccess: () => true, useProfile: () => ({ profile: { hasProAccess: true, uses24HourClock: true, timeZone: 'UTC', weekStartDay: 1, language: 'en' } }) }))
vi.mock('@/hooks/use-config', async () => { const { DEFAULT_CONFIG } = await import('@orbit/shared/types/config'); return { useConfig: () => ({ config: DEFAULT_CONFIG }) } })
vi.mock('@/hooks/use-reminder-permission', () => ({ useReminderPermission: () => ({ toggleReminder: vi.fn(), showNotice: false }) }))

it('retries a persisted move with lost response against fresh parent authority and the explicit root choice', async () => {
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
  const attempted: { endpoint: string; method: string; body: string }[] = []
  let persistedParent: string | null = null
  let readsFail = false
  transport.request.mockReset().mockImplementation((endpoint: string, options?: RequestInit) => {
    const method = options?.method ?? 'GET'
    if (method !== 'GET' && method !== 'HEAD') {
      attempted.push({ endpoint, method, body: options?.body as string })
      const request = JSON.parse(options!.body as string)
      if (request.clearParent) persistedParent = null
      else if (request.parentId) persistedParent = request.parentId
      if (attempted.length === 1) {
        readsFail = true
        return Promise.reject(new Error('Response lost'))
      }
      return Promise.resolve()
    }
    if (endpoint === API.habits.get(source.id)) {
      if (readsFail) return Promise.reject(new Error('Readback unavailable'))
      return Promise.resolve({ ...detail, parentId: persistedParent })
    }
    if (endpoint.startsWith(API.habits.list)) return Promise.resolve({ items: endpoint.includes('isGeneral=true') ? [] : items, page: 1, pageSize: 200, totalCount: 2, totalPages: 1 })
    return Promise.resolve([])
  })
  const onSaved = vi.fn()
  const onClose = vi.fn()
  let tree!: ReactTestRenderer
  const settle = async () => { await new Promise((resolve) => setTimeout(resolve, 20)) }
  const field = () => tree.root.findAll((row) => row.type === ListRow && row.props.title === 'habits.form.parentHabit')[0]!
  const save = () => tree.root.findAll((button) => button.type === PillButton && button.props.children === 'common.save')[0]!
  const choose = async (label: string) => {
    await act(async () => { (field().props.onClick as () => void)(); await settle() })
    await act(() => (tree.root.findAll((row) => row.type === RadioRow && row.props.label === label)[0]!.props.onSelect as () => void)())
    const picker = tree.root.findAll((node) => String(node.type) === 'Sheet' && node.props.title === 'habits.form.parentHabit')[0]!
    await act(() => (picker.findAll((node) => node.props.accessibilityLabel === 'attempt-dismiss')[0]!.props.onPress as () => void)())
  }
  try {
    await act(async () => { tree = create(<QueryClientProvider client={client}><EditHabitModal open habit={source} onClose={onClose} onSaved={onSaved} /></QueryClientProvider>); await settle() })
    expect(field().props.value).toBe('habits.moveParent.toRoot')
    await choose('Off-day destination')
    expect(field().props.value).toBe('Off-day destination')
    expect(attempted).toEqual([])
    await act(async () => { await (save().props.onClick as () => Promise<void>)(); await settle() })
    expect(persistedParent).toBe(parentId)
    expect(onSaved).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(tree.root.findAll((node) => String(node.type) === 'Text' && node.props.children === 'habits.form.saveUncertain')).toHaveLength(1)
    expect(client.getQueryData(habitKeys.detail(source.id))).toMatchObject({ parentId: null })
    await choose('habits.moveParent.toRoot')
    expect(field().props.value).toBe('habits.moveParent.toRoot')
    expect(attempted).toHaveLength(1)
    readsFail = false
    await act(async () => { await (save().props.onClick as () => Promise<void>)(); await settle() })
    expect(onSaved).toHaveBeenCalledOnce()
    expect(attempted).toHaveLength(2)
    expect(attempted.every((write) => write.method === 'PUT' && write.endpoint === API.habits.update(source.id))).toBe(true)
    expect(JSON.parse(attempted[1]!.body)).toMatchObject({ clearParent: true, title: source.title, checklistItems: source.checklistItems, tagIds: [], goalIds: [] })
    expect(persistedParent).toBeNull()
  } finally {
    await act(() => tree.update(<></>))
    client.clear()
  }
})
