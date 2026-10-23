import React from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import { createMockHabit, createMockHabitScheduleItem } from '@orbit/shared/__tests__/factories'
import { habitKeys } from '@orbit/shared/query'
import { useEditorParent } from '@/hooks/use-editor-parent'

const read = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api-fetch', () => ({ fetchJson: read }))
vi.mock('@/hooks/use-config', async () => { const { DEFAULT_CONFIG } = await import('@orbit/shared/types/config'); return { useConfig: () => ({ config: DEFAULT_CONFIG }) } })
const source = createMockHabit({ id: 'source' })
const t = (key: string) => key

it('loads both complete account inventories on demand, including off-day, General and later-page completed targets', async () => {
  const scheduled = createMockHabitScheduleItem({ ...source, children: [] })
  const later = createMockHabitScheduleItem({ id: 'later', title: 'Completed later-page destination', isCompleted: true, frequencyUnit: null, scheduledDates: [], children: [] })
  const general = createMockHabitScheduleItem({ id: 'general', isGeneral: true, children: [] })
  let finishPage!: (value: unknown) => void
  read.mockReset().mockImplementation((url: string) => {
    const params = new URL(url, 'https://fixture.invalid').searchParams
    const items = params.get('isGeneral') === 'true' ? [general] : [scheduled]
    if (params.get('page') === '2') return new Promise((resolve) => { finishPage = resolve })
    return Promise.resolve({ items, page: 1, pageSize: 200, totalCount: items.length, totalPages: params.get('isGeneral') === 'true' ? 1 : 2 })
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  const { result, unmount } = renderHook(() => useEditorParent(source, { ...source, parentId: null, children: [] }, false, null, t), { wrapper })
  expect(read).not.toHaveBeenCalled()
  act(() => result.current.show())
  await waitFor(() => expect(finishPage).toBeTypeOf('function'))
  expect(result.current.options).toEqual([])
  expect(result.current.state).toBe('loading')
  await act(async () => finishPage({ items: [later], page: 2, pageSize: 200, totalCount: 2, totalPages: 2 }))
  await waitFor(() => expect(result.current.state).toBeUndefined())
  expect(result.current.options.map((option) => option.id)).toContain('general')
  expect(result.current.options.find((option) => option.id === 'later')?.disabled).toBe(false)
  expect(result.current.options.find((option) => option.id === 'source')?.disabled).toBe(true)
  expect(read).toHaveBeenCalledTimes(3)
  for (const [url] of read.mock.calls) {
    const params = new URL(url, 'https://fixture.invalid').searchParams
    for (const key of ['dateFrom', 'dateTo', 'search', 'tagIds', 'frequencyUnit', 'isCompleted']) expect(params.has(key)).toBe(false)
  }
  unmount()
  client.clear()
})

it('keeps an absent readback unknown even with a complete root inventory', async () => {
  read.mockReset().mockResolvedValue({ items: [], page: 1, pageSize: 200, totalCount: 0, totalPages: 1 })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  const { result, unmount } = renderHook(() => useEditorParent(source, undefined, false, null, t), { wrapper })
  act(() => result.current.show())
  await waitFor(() => expect(result.current.state).toBe('error'))
  expect(result.current.value).toBe('common.unknown')
  act(() => result.current.select(null))
  expect(result.current.change).toEqual({})
  expect(result.current.selected).toBeUndefined()
  unmount()
  client.clear()
})

it('identifies a cold authoritative parent before picker demand and retains its name through inventory failure', async () => {
  const parent = createMockHabitScheduleItem({ id: 'parent', title: 'Authoritative parent', children: [] })
  read.mockReset().mockImplementation((url: string) => Promise.resolve({ items: url.includes('isGeneral=true') ? [] : [parent], page: 1, pageSize: 200, totalCount: 1, totalPages: 1 }))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  const { result, unmount } = renderHook(() => useEditorParent(source, { ...source, parentId: parent.id, children: [] }, false, null, t), { wrapper })
  await waitFor(() => expect(result.current.value).toBe(parent.title))
  expect(result.current.open).toBe(false)
  expect(result.current.selected).toBe(parent.id)
  expect(result.current.change).toEqual({})
  read.mockRejectedValue(new Error('Inventory unavailable'))
  act(() => result.current.show())
  await act(async () => { await result.current.retry() })
  await waitFor(() => expect(result.current.state).toBe('error'))
  expect(result.current.value).toBe(parent.title)
  expect(result.current.change).toEqual({})
  unmount()
  client.clear()
})

it('uses a matching cached filtered-list name without trusting its relationship over detail', async () => {
  read.mockReset().mockRejectedValue(new Error('Inventory unavailable'))
  const parent = createMockHabitScheduleItem({ id: 'parent', title: 'Cached parent', children: [] })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(habitKeys.list({ search: 'filtered', dateFrom: '2026-09-12' }), [parent])
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  const { result, rerender, unmount } = renderHook(({ parentId }: { parentId: string | null | undefined }) => useEditorParent({ ...source, parentId: 'stale-list-parent' }, { ...source, parentId, children: [] }, false, null, t), { wrapper, initialProps: { parentId: parent.id as string | null | undefined } })
  expect(result.current.value).toBe(parent.title)
  expect(read).not.toHaveBeenCalled()
  act(() => result.current.show())
  await waitFor(() => expect(result.current.state).toBe('error'))
  expect(result.current.value).toBe(parent.title)
  rerender({ parentId: null })
  expect(result.current.value).toBe('habits.moveParent.toRoot')
  rerender({ parentId: undefined })
  expect(result.current.value).toBe('common.unknown')
  expect(result.current.change).toEqual({})
  unmount()
  client.clear()
})
