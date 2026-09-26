import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { BlockFrameProps } from '@orbit/shared/contracts/blocks'
import { RecordListCard } from '@/components/chat/record-list-card'

const mocks = vi.hoisted(() => ({ push: vi.fn(), markRead: vi.fn(), fetchJson: vi.fn(), generation: 0, onAccountChange: null as null | (() => void) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('next-intl', () => ({ useLocale: () => 'en-US', useTranslations: () => (key: string, values?: Record<string, unknown>) => values ? `${key}:${JSON.stringify(values)}` : key }))
vi.mock('@/hooks/use-notifications', () => ({ useMarkNotificationRead: () => ({ mutateAsync: mocks.markRead }) }))
vi.mock('@/lib/api-fetch', () => ({ fetchJson: mocks.fetchJson }))
vi.mock('@/lib/session-epoch', () => ({ getAccountGeneration: () => mocks.generation, subscribeToAccountGeneration: (callback: () => void) => { mocks.onAccountChange = callback; return () => { mocks.onAccountChange = null } } }))
vi.mock('@/components/ui/block-frame', () => ({ BlockFrame: ({ state, count, items, body, actions }: BlockFrameProps) => <section data-state={state}><p>{count}</p>{body}{items.map((item) => <div data-testid="record-row" key={item.id}>{item.label}{item.meta}{item.control}</div>)}{actions}</section> }))

describe('Astra record list on web', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.generation = 0 })

  it('marks a notification read optimistically and restores it on failure', async () => {
    let rejectRead: (reason: Error) => void = () => {}
    mocks.markRead.mockReturnValue(new Promise((_resolve, reject) => { rejectRead = reject }))
    render(<RecordListCard recordList={{ kind: 'notifications', totalCount: 1, items: [{ id: 'n1', title: 'Reminder', isRead: false }] }} />)
    fireEvent.click(screen.getByRole('button', { name: 'notifications.markRead:{"title":"Reminder"}' }))
    expect(screen.queryByRole('button', { name: /notifications.markRead/ })).not.toBeInTheDocument()
    expect(mocks.markRead).toHaveBeenCalledWith('n1')
    rejectRead(new Error('offline'))
    await waitFor(() => expect(screen.getByRole('button', { name: /notifications.markRead/ })).toBeInTheDocument())
    expect(screen.getByRole('status')).toHaveTextContent('chat.recordList.markReadError')
    expect(screen.getByRole('status').closest('section')).toHaveAttribute('data-state', 'partiallyFailed')
  })

  it('pages 10 of 37 in place and only shows supported destination chips', async () => {
    mocks.fetchJson.mockResolvedValue({ kind: 'keys', totalCount: 37, items: Array.from({ length: 10 }, (_, index) => ({ id: `next-${index}`, title: `Key ${index}`, state: 'revoked' })), nextCursor: 'next' })
    const first = Array.from({ length: 10 }, (_, index) => ({ id: `key-${index}`, title: `Key ${index}`, state: 'active' as const }))
    render(<RecordListCard recordList={{ kind: 'keys', totalCount: 37, items: first, nextCursor: 'cursor', surfaceId: 'profile' }} />)
    expect(screen.getByText('chat.recordList.count:{"shown":10,"total":37}')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'chat.recordList.more' }))
    await waitFor(() => expect(screen.getAllByTestId('record-row')).toHaveLength(20))
    expect(screen.getAllByText('chat.recordList.keyState.revoked')).toHaveLength(10)
    fireEvent.change(screen.getByRole('searchbox', { name: 'chat.recordList.filter' }), { target: { value: 'Key 3' } })
    expect(screen.getAllByTestId('record-row')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'chat.recordList.open.keys' }))
    expect(mocks.push).toHaveBeenCalledWith('/profile')
  })

  it('does not show a chip for tags', () => {
    render(<RecordListCard recordList={{ kind: 'tags', totalCount: 1, items: [{ id: 'tag-1', title: 'Focus' }] }} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('can page again after switching accounts during a pending page', async () => {
    let resolveFirst: (value: unknown) => void = () => {}
    mocks.fetchJson.mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve }))
    mocks.fetchJson.mockResolvedValue({ kind: 'keys', totalCount: 30, items: [], nextCursor: null })
    render(<RecordListCard recordList={{ kind: 'keys', totalCount: 30, items: [{ id: 'k1', title: 'Key' }], nextCursor: 'cursor' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'chat.recordList.more' }))
    expect(mocks.fetchJson).toHaveBeenCalledTimes(1)
    act(() => { mocks.generation++; mocks.onAccountChange?.() })
    fireEvent.click(screen.getByRole('button', { name: 'chat.recordList.more' }))
    expect(mocks.fetchJson).toHaveBeenCalledTimes(2)
    await act(async () => { resolveFirst({ kind: 'keys', totalCount: 30, items: [], nextCursor: null }); await Promise.resolve() })
  })

  it('drops a pending mark-read completion after an account switch', async () => {
    let finish: () => void = () => {}
    mocks.markRead.mockReturnValue(new Promise<void>((resolve) => { finish = resolve }))
    render(<RecordListCard recordList={{ kind: 'notifications', totalCount: 1, items: [{ id: 'n1', title: 'Reminder', isRead: false }] }} />)
    fireEvent.click(screen.getByRole('button', { name: 'notifications.markRead:{"title":"Reminder"}' }))
    act(() => { mocks.generation++; mocks.onAccountChange?.() })
    await act(async () => { finish(); await Promise.resolve() })
    expect(screen.getByRole('button', { name: 'notifications.markRead:{"title":"Reminder"}' })).toBeInTheDocument()
  })
})
