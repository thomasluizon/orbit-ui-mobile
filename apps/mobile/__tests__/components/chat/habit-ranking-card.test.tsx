import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer'
import { habitRankingCardFixture, habitRankingNextPageFixture } from '@orbit/shared/test-support/chat-fixtures'
import { habitRankingCardSchema, habitRankingResponseSchema } from '@orbit/shared/types/chat'
import { ApiClientError } from '@orbit/shared/utils'
import { ChatBlock } from '@/components/chat/block-registry'
import { HabitRankingCard } from '@/components/chat/habit-ranking-card'
import { advanceAccountGeneration } from '@/lib/session-epoch'
import { i18n } from '@/lib/i18n'
import { renderedText } from '../../support/react-test-renderer'

vi.unmock('react-i18next')
const renderer = require('react-test-renderer') as typeof import('react-test-renderer')
const mocks = vi.hoisted(() => ({ request: vi.fn(), router: { push: vi.fn() } }))
vi.mock('@/lib/api-client', () => ({ apiClient: mocks.request }))
vi.mock('expo-router', () => ({ useRouter: () => mocks.router }))
vi.mock('@/components/chat/habit-list-card', () => ({ HabitListCard: () => null }))
vi.mock('@/components/chat/goal-list-card', () => ({ GoalListCard: () => null }))
vi.mock('@/components/chat/metrics-card', () => ({ MetricsCard: () => null }))
vi.mock('@/components/chat/period-insight-card', () => ({ PeriodInsightCard: () => null }))
vi.mock('@/components/chat/day-summary-card', () => ({ DaySummaryCard: () => null }))
vi.mock('@/components/chat/streak-card', () => ({ StreakCard: () => null }))
vi.mock('@/components/chat/calendar-card', () => ({ CalendarCard: () => null }))
vi.mock('@/components/chat/record-list-card', () => ({ RecordListCard: () => null }))
vi.mock('@/components/chat/account-rows-card', () => ({ AccountRowsCard: () => null }))
vi.mock('@/components/chat/choice-block', () => ({ ChoiceBlock: () => null }))
vi.mock('@/components/chat/pick-list-block', () => ({ PickListBlock: () => null }))
const card = habitRankingCardSchema.parse(habitRankingCardFixture)
const next = habitRankingResponseSchema.parse(habitRankingNextPageFixture)
let tree: ReactTestRenderer
async function mount(element: React.ReactElement) { await renderer.act(() => { tree = renderer.create(element) }) }
const content = () => JSON.stringify(tree.toJSON())
function button(name: string): ReactTestInstance {
  return tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'button' && (node.props.accessibilityLabel === name || renderedText(node.props.children).includes(name)))[0]!
}
async function press(name: string) { await renderer.act(async () => { button(name).props.onPress(); await Promise.resolve() }) }
beforeEach(async () => { vi.clearAllMocks(); await i18n.changeLanguage('en'); mocks.request.mockResolvedValue(next) })
afterEach(async () => { await renderer.act(() => tree.unmount()); await i18n.changeLanguage('en') })

describe('Android habit ranking renderer and actions', () => {
  it.each(['en', 'pt-BR'])('renders the registry block with exact dates, ranks and counts in %s', async locale => {
    await i18n.changeLanguage(locale)
    await mount(<ChatBlock part={{ kind: 'habitRanking', block: card }} onActionChipClick={undefined} />)
    expect(content()).toContain(locale === 'en' ? '1,200 completions' : '1.200 conclusões')
    expect(content()).toContain(locale === 'en' ? 'From Jul 1, 2026' : 'De 1 de jul. de 2026')
    expect(content()).toContain(locale === 'en' ? 'Through Sep 30, 2026' : 'Até 30 de set. de 2026')
    expect(button(locale === 'en' ? '1. Water, 1,200 completions' : '1. Water, 1.200 conclusões')).toBeDefined()
  })
  it('appends tied server rows once through the real action owner', async () => {
    await mount(<HabitRankingCard habitRanking={card} />)
    await press('Show more')
    expect(content()).toContain('3. Read, 20 completions')
    expect(content()).toContain('1. Water, 1,200 completions')
    expect(mocks.request).toHaveBeenCalledTimes(1)
    const path = new URL(mocks.request.mock.calls[0]![0] as string, 'https://example.test')
    expect(path.searchParams.get('queryToken')).toBe(card.ranking.queryToken)
    expect(path.searchParams.get('cursor')).toBe(card.ranking.nextCursor)
    expect(content()).not.toContain('Show more')
  })
  it('keeps rows on failed refresh and recovers an expired page with the original query token', async () => {
    mocks.request.mockRejectedValueOnce(new ApiClientError(409, 'Stale')).mockRejectedValueOnce(new TypeError('Offline')).mockResolvedValueOnce(card.ranking)
    await mount(<HabitRankingCard habitRanking={card} />)
    await press('Show more')
    expect(content()).toContain('Ranking changed.')
    await press('Refresh')
    expect(content()).toContain('Could not refresh. Try again.')
    expect(content()).toContain('1,200 completions')
    await press('Refresh')
    const path = new URL(mocks.request.mock.calls[2]![0] as string, 'https://example.test')
    expect(path.searchParams.get('queryToken')).toBe(card.ranking.queryToken)
    expect(path.searchParams.get('refresh')).toBe('true')
    expect(path.searchParams.has('cursor')).toBe(false)
  })
  it('opens the actual habit and handles a removed target within the ranking', async () => {
    mocks.request.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new ApiClientError(404, 'Removed'))
    await mount(<HabitRankingCard habitRanking={card} />)
    await press('1. Water, 1,200 completions')
    expect(mocks.router.push).toHaveBeenCalledExactlyOnceWith({ pathname: '/habits/[id]', params: { id: card.ranking.rows[0]!.habitId } })
    await press('2. Walk, 20 completions')
    expect(content()).toContain('Habit unavailable.')
    expect(mocks.router.push).toHaveBeenCalledTimes(1)
  })
  it('shows an empty answer and disables actions while offline', async () => {
    const empty = { ...card, ranking: { ...card.ranking, rows: [], totalCount: 0, isComplete: true, nextCursor: null } }
    await mount(<HabitRankingCard habitRanking={empty} />)
    expect(content()).toContain('No completions in this period.')
    await renderer.act(() => tree.update(<HabitRankingCard habitRanking={card} isOnline={false} />))
    expect(content()).toContain('Connect to continue.')
    expect(button('Show more').props.accessibilityState.disabled).toBe(true)
    expect(button('1. Water, 1,200 completions').props.accessibilityState.disabled).toBe(true)
  })
  it('drops a late page after account replacement', async () => {
    let deliver: (page: typeof next) => void = () => {}
    mocks.request.mockImplementation(() => new Promise(resolve => { deliver = resolve }))
    await mount(<HabitRankingCard habitRanking={card} />)
    await renderer.act(() => button('Show more').props.onPress())
    await renderer.act(() => { advanceAccountGeneration(); deliver(next) })
    expect(tree.toJSON()).toBe(null)
  })
})
