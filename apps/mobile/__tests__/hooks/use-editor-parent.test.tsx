import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactTestRenderer } from 'react-test-renderer'
import { expect, it, vi } from 'vitest'
import { createMockHabit, createMockHabitScheduleItem } from '@orbit/shared/__tests__/factories'
import { useEditorParent } from '@/hooks/use-editor-parent'

const { act, create } = require('react-test-renderer') as typeof import('react-test-renderer')
const read = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api-client', () => ({ apiClient: read }))
vi.mock('@/hooks/use-config', async () => { const { DEFAULT_CONFIG } = await import('@orbit/shared/types/config'); return { useConfig: () => ({ config: DEFAULT_CONFIG }) } })
const source = createMockHabit({ id: 'source' })
const t = (key: string) => key
let current!: ReturnType<typeof useEditorParent>
function Probe() {
  current = useEditorParent(source, { ...source, parentId: null, children: [] }, false, null, t)
  return null
}

it('loads both complete account inventories on demand and includes a later-page completed off-day destination', async () => {
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
  let tree!: ReactTestRenderer
  await act(() => { tree = create(<QueryClientProvider client={client}><Probe /></QueryClientProvider>); return Promise.resolve() })
  expect(read).not.toHaveBeenCalled()
  await act(async () => { current.show(); await new Promise((resolve) => setTimeout(resolve, 20)) })
  expect(finishPage).toBeTypeOf('function')
  expect(current.options).toEqual([])
  expect(current.state).toBe('loading')
  await act(async () => { finishPage({ items: [later], page: 2, pageSize: 200, totalCount: 2, totalPages: 2 }); await new Promise((resolve) => setTimeout(resolve, 20)) })
  expect(current.state).toBeUndefined()
  expect(current.options.map((option) => option.id)).toContain('general')
  expect(current.options.find((option) => option.id === 'later')?.disabled).toBe(false)
  expect(current.options.find((option) => option.id === 'source')?.disabled).toBe(true)
  expect(read).toHaveBeenCalledTimes(3)
  for (const [url] of read.mock.calls) {
    const params = new URL(url, 'https://fixture.invalid').searchParams
    for (const key of ['dateFrom', 'dateTo', 'search', 'tagIds', 'frequencyUnit', 'isCompleted']) expect(params.has(key)).toBe(false)
  }
  void act(() => tree.update(<></>))
  client.clear()
})
