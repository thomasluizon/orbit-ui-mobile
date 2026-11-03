import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockHabitScheduleItem } from '@orbit/shared/__tests__/factories'
import { buildHabitViewFilters, habitViewQueryOptions } from '@orbit/shared/utils'
import { useHabits } from '@/hooks/use-habit-queries'

const requests = vi.hoisted(() => ({ read: vi.fn() }))
vi.mock('@/lib/api-client', () => ({ apiClient: (url: string) => requests.read(url) }))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: () => true }))

const today = '2026-09-12'
let client: QueryClient
let tree: ReactTestRenderer | undefined
let current: ReturnType<typeof useHabits>

function Day({ date, enabled = true }: { date: string; enabled?: boolean }) {
  const filters = buildHabitViewFilters({ dateStr: date, isTodayDate: date === today,
    searchQuery: '', selectedFrequency: null, selectedTagIds: [], showGeneralOnToday: false })
  const query = useHabits(filters, { ...habitViewQueryOptions('today', today), enabled })
  React.useEffect(() => { current = query })
  return React.createElement('output', null, query.data?.topLevelHabits.map(habit => habit.title).join(','))
}

function renderDay(date: string, enabled = true) {
  const content = <QueryClientProvider client={client}><Day date={date} enabled={enabled} /></QueryClientProvider>
  void act(() => { if (tree) tree.update(content); else tree = create(content) })
}

async function advance(milliseconds = 1) {
  await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds) })
}

beforeEach(() => {
  vi.useFakeTimers()
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  requests.read.mockReset()
  requests.read.mockImplementation(async (url: string) => {
    const date = new URL(url, 'https://fixture.invalid').searchParams.get('dateFrom')!
    await new Promise(resolve => setTimeout(resolve, 3_000))
    const items = Array.from({ length: 50 }, (_, index) => createMockHabitScheduleItem({
      id: `${date}-${index}`, title: `${date} habit ${index}`, scheduledDates: [date],
    }))
    return { items, page: 1, pageSize: 50, totalCount: 50, totalPages: 1 }
  })
})

afterEach(() => {
  void act(() => tree?.unmount())
  tree = undefined
  client.clear()
  vi.useRealTimers()
})

describe('Today day cache', () => {
  it.each(['2026-09-11', '2026-09-13'])('renders settled neighbour %s synchronously without requesting it again', async neighbour => {
    renderDay(today)
    expect(requests.read).toHaveBeenCalledTimes(1)
    await advance(3_010)
    expect(current.isSuccess).toBe(true)
    await advance(3_010)
    const readsBefore = requests.read.mock.calls.filter(([url]) => String(url).includes(`dateFrom=${neighbour}`)).length
    expect(readsBefore).toBe(1)
    renderDay(neighbour)
    expect(current.isSuccess).toBe(true)
    expect(tree?.root.findAllByType('output')[0]!.props.children).toContain(`${neighbour} habit 0`)
    expect(requests.read.mock.calls.filter(([url]) => String(url).includes(`dateFrom=${neighbour}`))).toHaveLength(readsBefore)
    renderDay(today)
    expect(tree?.root.findAllByType('output')[0]!.props.children).toContain(`${today} habit 0`)
  })

  it('never replaces the newest day with a late result', async () => {
    renderDay(today)
    await advance(3_010)
    renderDay('2026-09-01')
    await advance(1_000)
    renderDay('2026-09-02')
    expect(current.data).toBeUndefined()
    await advance(2_010)
    expect(current.data).toBeUndefined()
    expect(tree?.root.findAllByType('output')[0]!.props.children).toBeUndefined()
    await advance(1_000)
    expect(tree?.root.findAllByType('output')[0]!.props.children).toContain('2026-09-02 habit 0')
    expect(tree?.root.findAllByType('output')[0]!.props.children).not.toContain('2026-09-01 habit 0')
  })

  it('does not prefetch before the selected day settles or when disabled', async () => {
    renderDay(today, false)
    await advance(4_000)
    expect(requests.read).not.toHaveBeenCalled()
    renderDay(today)
    await advance(2_000)
    expect(requests.read).toHaveBeenCalledTimes(1)
  })

  it('shows loading only after 300 ms and resets that delay on a new day', async () => {
    renderDay(today)
    expect(current.showLoading).toBe(false)
    await advance(299)
    expect(current.showLoading).toBe(false)
    await advance(1)
    expect(current.showLoading).toBe(true)
    renderDay('2026-09-01')
    expect(current.showLoading).toBe(false)
    expect(current.data).toBeUndefined()
    await advance(300)
    expect(current.showLoading).toBe(true)
    await advance(3_010)
    expect(current.showLoading).toBe(false)
  })

  it('keeps a failed prefetch retryable when that day is selected', async () => {
    const read = requests.read.getMockImplementation()!
    requests.read.mockImplementation((url: string) => url.includes('dateFrom=2026-09-13')
      ? Promise.reject(new Error('unavailable neighbour')) : read(url))
    renderDay(today)
    await advance(3_010)
    await advance(1)
    requests.read.mockImplementation(read)
    renderDay('2026-09-13')
    await advance(3_010)
    expect(tree?.root.findAllByType('output')[0]!.props.children).toContain('2026-09-13 habit 0')
  })
})
