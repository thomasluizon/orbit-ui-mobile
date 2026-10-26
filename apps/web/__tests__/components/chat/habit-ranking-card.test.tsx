import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { habitRankingCardFixture, habitRankingNextPageFixture } from '@orbit/shared/test-support/chat-fixtures'
import { habitRankingCardSchema, habitRankingResponseSchema } from '@orbit/shared/types/chat'
import { ChatBlock } from '@/components/chat/block-registry'
import { HabitRankingCard } from '@/components/chat/habit-ranking-card'
import { advanceAccountGeneration } from '@/lib/session-epoch'

const mocks = vi.hoisted(() => ({ load: vi.fn(), check: vi.fn(), router: { push: vi.fn() } }))
vi.mock('@/app/actions/habit-ranking', () => ({ loadHabitRanking: mocks.load, checkRankingHabit: mocks.check }))
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }))
const card = habitRankingCardSchema.parse(habitRankingCardFixture)
const next = habitRankingResponseSchema.parse(habitRankingNextPageFixture)
const provider = (children: React.ReactNode, locale = 'en') => <NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : pt}>{children}</NextIntlClientProvider>
beforeEach(() => { advanceAccountGeneration(); vi.clearAllMocks(); mocks.load.mockResolvedValue({ ok: true, data: next }); mocks.check.mockResolvedValue({ ok: true, data: true }) })
afterEach(cleanup)

describe('habit ranking renderer and actions', () => {
  it.each(['en', 'pt-BR'])('renders the negotiated block, exact dates, ranks and localized counts in %s', locale => {
    render(provider(<ChatBlock part={{ kind: 'habitRanking', block: card }} onActionChipClick={undefined} />, locale))
    expect(screen.getByRole('heading', { name: locale === 'en' ? 'Habit ranking' : 'Ranking de hábitos' })).toBeInTheDocument()
    expect(screen.getByText(locale === 'en' ? '1,200 completions' : '1.200 conclusões')).toBeInTheDocument()
    expect(screen.getByText(locale === 'en' ? 'From Jul 1, 2026' : 'De 1 de jul. de 2026')).toBeInTheDocument()
    expect(screen.getByText(locale === 'en' ? 'Through Sep 30, 2026' : 'Até 30 de set. de 2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /1\. Water/ })).toBeInTheDocument()
    expect(screen.queryByText(/completion rate|consistência/i)).not.toBeInTheDocument()
  })
  it('keeps existing rows and focus during paging, guards double presses and focuses refresh on the last page', async () => {
    let deliver: (value: { ok: true; data: typeof next }) => void = () => {}
    mocks.load.mockImplementationOnce(() => new Promise(resolve => { deliver = resolve }))
    render(provider(<HabitRankingCard habitRanking={card} />))
    const water = screen.getByRole('button', { name: /1\. Water/ })
    const more = screen.getByRole('button', { name: 'Show more' })
    more.focus()
    fireEvent.click(more)
    fireEvent.click(more)
    expect(more).toHaveFocus()
    expect(mocks.load).toHaveBeenCalledExactlyOnceWith(card.ranking.queryToken, card.ranking.nextCursor, false)
    await act(async () => { deliver({ ok: true, data: next }) })
    expect(screen.getByRole('button', { name: /1\. Water/ })).toBe(water)
    expect(screen.getByRole('button', { name: /3\. Read, 20 completions/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })
  it('keeps counts on a failed page and retries the same cursor', async () => {
    mocks.load.mockResolvedValueOnce({ ok: false, status: 503, error: 'Unavailable' }).mockResolvedValueOnce({ ok: true, data: next })
    render(provider(<HabitRankingCard habitRanking={card} />))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Show more' })) })
    expect(screen.getByRole('status')).toHaveTextContent('Could not load more. Try again.')
    expect(screen.getByText('1,200 completions')).toBeInTheDocument()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Show more' })) })
    expect(mocks.load.mock.calls).toEqual([[card.ranking.queryToken, card.ranking.nextCursor, false], [card.ranking.queryToken, card.ranking.nextCursor, false]])
  })
  it('offers exact-query refresh for an expired cursor and unavailable habit', async () => {
    mocks.load.mockResolvedValueOnce({ ok: false, status: 409, error: 'Stale' })
    const view = render(provider(<HabitRankingCard habitRanking={card} />))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Show more' })) })
    expect(screen.getByRole('status')).toHaveTextContent('Ranking changed.')
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument()
    view.unmount()
    mocks.check.mockResolvedValue({ ok: false, status: 404, error: 'Removed' })
    render(provider(<HabitRankingCard habitRanking={card} />))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /1\. Water/ })) })
    expect(screen.getByRole('status')).toHaveTextContent('Habit unavailable.')
    expect(mocks.router.push).not.toHaveBeenCalled()
  })
  it('opens the actual habit and retains the answer when returning', async () => {
    const view = render(provider(<HabitRankingCard habitRanking={card} />))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Show more' })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /1\. Water/ })) })
    expect(mocks.check).toHaveBeenCalledWith(card.ranking.rows[0]!.habitId)
    expect(mocks.router.push).toHaveBeenCalledWith(`/habits/${card.ranking.rows[0]!.habitId}`)
    view.unmount()
    render(provider(<HabitRankingCard habitRanking={card} />))
    expect(screen.getByRole('button', { name: /3\. Read, 20 completions/ })).toBeInTheDocument()
    expect(screen.getByText('From Jul 1, 2026')).toBeInTheDocument()
  })
  it('has one empty state and keeps offline controls unavailable until reconnection', () => {
    const empty = { ...card, ranking: { ...card.ranking, rows: [], totalCount: 0, isComplete: true, nextCursor: null } }
    const view = render(provider(<HabitRankingCard habitRanking={empty} />))
    expect(screen.getByText('No completions in this period.')).toBeInTheDocument()
    view.rerender(provider(<HabitRankingCard habitRanking={card} isOnline={false} />))
    expect(screen.getByRole('status')).toHaveTextContent('Connect to continue.')
    expect(screen.getByRole('button', { name: 'Show more' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /1\. Water/ })).toBeDisabled()
    view.rerender(provider(<HabitRankingCard habitRanking={card} />))
    expect(screen.getByRole('button', { name: 'Show more' })).toBeEnabled()
  })
  it('ignores navigation and page responses belonging to a replaced account', async () => {
    let deliver: (value: { ok: true; data: typeof next }) => void = () => {}
    mocks.load.mockImplementation(() => new Promise(resolve => { deliver = resolve }))
    render(provider(<HabitRankingCard habitRanking={card} />))
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }))
    await act(async () => { advanceAccountGeneration(); deliver({ ok: true, data: next }) })
    expect(screen.queryByRole('heading', { name: 'Habit ranking' })).not.toBeInTheDocument()
    expect(mocks.router.push).not.toHaveBeenCalled()
  })
  it('does not navigate when an old account habit check completes late', async () => {
    let deliver: (value: { ok: true; data: boolean }) => void = () => {}
    mocks.check.mockImplementation(() => new Promise(resolve => { deliver = resolve }))
    render(provider(<HabitRankingCard habitRanking={card} />))
    fireEvent.click(screen.getByRole('button', { name: /1\. Water/ }))
    await act(async () => { advanceAccountGeneration(); deliver({ ok: true, data: true }) })
    expect(mocks.router.push).not.toHaveBeenCalled()
  })
})
