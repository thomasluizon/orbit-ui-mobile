import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { enableTestFlags } from '@orbit/shared/test-support/flag-state'
import type { HabitsFilter, NormalizedHabit } from '@orbit/shared/types/habit'
import SearchPage from '@/app/(app)/search/page'
import { measureClampedPersonalText } from '@/__tests__/support/personal-text'

const mocks = vi.hoisted(() => ({ back: vi.fn(), push: vi.fn(), query: vi.fn(), retry: vi.fn(), reducedMotion: false }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, back: mocks.back }) }))
vi.mock('@/hooks/use-is-desktop', () => ({ useIsWideDesktop: () => false }))
vi.mock('@/hooks/use-habit-queries', () => ({ useSearchHabits: (filters: HabitsFilter) => mocks.query(filters) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { timeZone: 'UTC' } }) }))

function result(habits: NormalizedHabit[], { pending = false, error = false, totalPages = 1 } = {}) {
  return {
    data: { topLevelHabits: habits, habitsById: new Map(habits.map((habit) => [habit.id, habit])), childrenByParent: new Map(), totalCount: habits.length, totalPages, currentPage: 1 },
    isPending: pending, isFetching: pending, isSuccess: !pending && !error, isError: error, refetch: mocks.retry,
  }
}

const habit = (id: string, title: string) => createMockHabit({ id, title, searchMatches: [{ field: 'title', value: null }] })

function mount(locale: 'en' | 'pt-BR' = 'pt-BR') {
  const messages = locale === 'en' ? en : ptBR
  const view = render(<NextIntlClientProvider locale={locale} messages={messages}><SearchPage /></NextIntlClientProvider>)
  return { ...view, messages, field: () => screen.getByRole('combobox'), mascot: () => view.container.querySelector<SVGElement>('[data-asset="orbit-mascot"]')! }
}

function type(value: string) {
  fireEvent.change(screen.getByRole('combobox'), { target: { value } })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.reducedMotion = false
  Element.prototype.scrollIntoView = vi.fn()
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)' && mocks.reducedMotion, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  mocks.query.mockReturnValue(result([]))
  measureClampedPersonalText()
})
afterEach(() => { Reflect.deleteProperty(navigator, 'onLine'); vi.useRealTimers() })

describe('the search route with the guided flows off', () => {
  it.each(['en', 'pt-BR'] as const)('renders the current surface in %s: the title is the heading and no Orbit shows', async (locale) => {
    mocks.query.mockReturnValue(result([habit('walk', 'Walk')]))
    const { container, messages } = mount(locale)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(messages.habits.search.title)
    expect(container.querySelector('[data-asset="orbit-mascot"]')).toBeNull()
    expect(container.querySelector('[data-search-block]')).toBeNull()
    type('walk')
    expect(await screen.findByText(locale === 'en' ? '1 habit' : '1 hábito')).toBeInTheDocument()
    expect(container.querySelector('[data-search-orbit-line]')).toBeNull()
  })
})

describe('the search route on the Orbit logic', () => {
  beforeEach(() => enableTestFlags('orbit_guided_flows'))

  it.each(['en', 'pt-BR'] as const)('shows one centred block before a query in %s: Orbit in Parado at 96, the question as the one h1 and the field it names', (locale) => {
    const { container, messages, field, mascot } = mount(locale)
    const headings = screen.getAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent(messages.habits.search.question)
    expect(field()).toHaveAccessibleName(messages.habits.search.question)
    expect(screen.getAllByText(messages.habits.search.question).filter((node) => !node.hasAttribute('cmdk-label'))).toHaveLength(1)
    expect(screen.getByText(messages.habits.search.title).tagName).toBe('P')
    expect(mascot().getAttribute('data-orbit-state')).toBe('parado')
    expect(mascot().getAttribute('width')).toBe('96')
    expect(container.querySelectorAll('[data-asset="orbit-mascot"]')).toHaveLength(1)
    const block = container.querySelector('[data-search-block]')!
    expect(block.getAttribute('data-search-block')).toBe('resting')
    expect(block.closest('[data-shell-centred-region]')).not.toBeNull()
    expect(block.contains(headings[0]!)).toBe(true)
    expect(block.contains(field())).toBe(true)
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('draws Orbit at 128 at 1024 and above', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(min-width: 1024px)', media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    expect(mount().mascot().getAttribute('width')).toBe('128')
  })

  it('turns Orbit to Olhando while the field has focus and back to Parado on blur', () => {
    const { field, mascot } = mount()
    fireEvent.focus(field())
    expect(mascot().getAttribute('data-orbit-state')).toBe('olhando')
    fireEvent.blur(field())
    expect(mascot().getAttribute('data-orbit-state')).toBe('parado')
  })

  it.each([
    { locale: 'pt-BR' as const, count: 1, line: 'Achei 1 hábito.' },
    { locale: 'pt-BR' as const, count: 3, line: 'Achei 3 hábitos.' },
    { locale: 'en' as const, count: 1, line: 'I found 1 habit.' },
    { locale: 'en' as const, count: 3, line: 'I found 3 habits.' },
  ])('states the count in the Orbit line beside Orbit at 48 in $locale for $count', async ({ locale, count, line }) => {
    mocks.query.mockReturnValue(result(Array.from({ length: count }, (_, index) => habit(`habit-${index}`, `Walk ${index}`))))
    const { container, field, mascot } = mount(locale)
    fireEvent.focus(field())
    type('walk')
    const sentence = await screen.findByText(line)
    const row = container.querySelector('[data-search-orbit-line]')!
    expect(row.contains(sentence)).toBe(true)
    expect(row.contains(mascot())).toBe(true)
    expect(mascot().getAttribute('width')).toBe('48')
    expect(mascot().getAttribute('data-orbit-state')).toBe('olhando')
    expect(container.querySelectorAll('[data-asset="orbit-mascot"]')).toHaveLength(1)
    expect(container.querySelector('[data-search-block]')!.getAttribute('data-search-block')).toBe('results')
    expect(container.querySelector('[data-shell-centred-region]')).toBeNull()
    expect(screen.getAllByRole('option')).toHaveLength(count)
    expect(screen.queryByText(locale === 'en' ? `${count} habits` : `${count} hábitos`)).toBeNull()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('keeps the field mounted with its focus and its text when the first letter moves the block under the header', async () => {
    mocks.query.mockReturnValue(result([habit('walk', 'Walk')]))
    const { field } = mount()
    const before = field()
    before.focus()
    type('w')
    await screen.findByText('Achei 1 hábito.')
    expect(field()).toBe(before)
    expect(document.activeElement).toBe(before)
    expect(before).toHaveValue('w')
  })

  it('changes the Orbit line with the result set and sends no request other than the search', async () => {
    mocks.query.mockReturnValue(result([habit('walk', 'Walk'), habit('run', 'Run')]))
    mount()
    type('a')
    expect(await screen.findByText('Achei 2 hábitos.')).toBeInTheDocument()
    mocks.query.mockReturnValue(result([habit('walk', 'Walk')]))
    type('wa')
    expect(await screen.findByText('Achei 1 hábito.')).toBeInTheDocument()
    expect(screen.queryByText('Achei 2 hábitos.')).toBeNull()
    const searches = new Set(mocks.query.mock.calls.map(([filters]) => JSON.stringify(filters)))
    expect(searches).toEqual(new Set([
      JSON.stringify({ search: '', page: 1, pageSize: 20 }),
      JSON.stringify({ search: 'a', page: 1, pageSize: 20 }),
      JSON.stringify({ search: 'wa', page: 1, pageSize: 20 }),
    ]))
  })

  it('announces a changed line in one polite status region after a one second pause', async () => {
    mocks.query.mockReturnValue(result([habit('walk', 'Walk')]))
    vi.useFakeTimers()
    const { container } = mount()
    type('walk')
    await vi.advanceTimersByTimeAsync(400)
    const status = container.querySelector('p[role="status"]')!
    expect(screen.getByText('Achei 1 hábito.', { selector: '[data-search-line]' })).toBeInTheDocument()
    expect(status).toHaveTextContent('')
    await vi.advanceTimersByTimeAsync(1000)
    expect(status).toHaveTextContent('Achei 1 hábito.')
  })

  it.each(['en', 'pt-BR'] as const)('names a miss in the Orbit line with Orbit in Parado in %s, and keeps the create action', async (locale) => {
    const { container, messages, field, mascot } = mount(locale)
    fireEvent.focus(field())
    type('yoga')
    const create = await screen.findByRole('button', { name: messages.habits.search.create })
    const line = container.querySelector('[data-search-line="miss"]')!
    expect(line).toHaveTextContent(locale === 'en' ? 'Nothing found for “yoga”' : 'Nada encontrado para “yoga”')
    expect(container.querySelector('[data-search-orbit-line]')!.contains(line)).toBe(true)
    expect(screen.getAllByText('“yoga”')).toHaveLength(1)
    expect(mascot().getAttribute('data-orbit-state')).toBe('parado')
    expect(screen.getByText(messages.habits.search.emptyBody)).toBeInTheDocument()
    fireEvent.click(create)
    expect(mocks.push).toHaveBeenCalledWith('/habits/new?title=yoga&from=%2Fsearch')
  })

  it('keeps the offline refusal of create, with its reason', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    mount('en')
    type('new habit')
    fireEvent.click(await screen.findByRole('button', { name: en.habits.search.create }))
    expect(screen.getByText(en.offline.create.title)).toBeVisible()
    expect(screen.getByText(en.offline.create.reason)).toBeVisible()
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('shows the load error with its retry beside Orbit in Parado, and the retry runs the search again', async () => {
    mocks.query.mockReturnValue(result([], { error: true }))
    const { container, field, mascot } = mount()
    fireEvent.focus(field())
    type('walk')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(ptBR.habits.search.loadError)
    expect(container.querySelector('[data-search-orbit-line]')!.contains(alert)).toBe(true)
    expect(mascot().getAttribute('data-orbit-state')).toBe('parado')
    fireEvent.click(screen.getByRole('button', { name: ptBR.common.retry }))
    expect(mocks.retry).toHaveBeenCalledTimes(1)
  })

  it('keeps the searching status in the line while the search runs, with Orbit in Olhando', async () => {
    mocks.query.mockReturnValue(result([], { pending: true }))
    const { container, field, mascot } = mount('en')
    fireEvent.focus(field())
    type('walk')
    const status = await screen.findByRole('status', { name: 'Searching' })
    expect(container.querySelector('[data-search-orbit-line]')!.contains(status)).toBe(true)
    expect(mascot().getAttribute('data-orbit-state')).toBe('olhando')
    expect(screen.getByRole('listbox')).toHaveAttribute('aria-busy', 'true')
    expect(field()).toHaveValue('walk')
  })

  it('opens the habit through the current route on a row press and on Enter', async () => {
    mocks.query.mockReturnValue(result([habit('walk', 'Walk'), habit('run', 'Run')]))
    const { field } = mount('en')
    type('a')
    fireEvent.click(await screen.findByRole('option', { name: 'Open Run in the name' }))
    expect(mocks.push).toHaveBeenLastCalledWith('/habits/run')
    fireEvent.keyDown(field(), { key: 'ArrowDown' })
    fireEvent.keyDown(field(), { key: 'ArrowUp' })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(mocks.push).toHaveBeenLastCalledWith('/habits/walk')
    expect(within(screen.getByRole('option', { name: 'Open Walk in the name' })).getByText('in the name')).toBeInTheDocument()
  })

  it('keeps the previous and the next control with the page requests of the current surface', async () => {
    mocks.query.mockReturnValue(result([habit('walk', 'Walk')], { totalPages: 2 }))
    mount('en')
    type('walk')
    await screen.findByText('I found 1 habit.')
    expect(screen.queryByRole('button', { name: en.habits.search.previous })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.habits.search.next }))
    expect(mocks.query).toHaveBeenLastCalledWith({ search: 'walk', page: 2, pageSize: 20 })
    expect(screen.queryByRole('button', { name: en.habits.search.next })).toBeNull()
    await screen.findByText('I found 1 habit.')
    fireEvent.click(screen.getByRole('button', { name: en.habits.search.previous }))
    expect(mocks.query).toHaveBeenLastCalledWith({ search: 'walk', page: 1, pageSize: 20 })
  })

  it('goes back through the same header control', () => {
    mount('en')
    fireEvent.click(screen.getByRole('button', { name: en.common.back }))
    expect(mocks.back).toHaveBeenCalledTimes(1)
  })

  it('starts no entrance animation on the results for a keystroke', async () => {
    mocks.query.mockReturnValue(result([habit('walk', 'Walk')]))
    const { container } = mount('en')
    type('w')
    await screen.findByText('I found 1 habit.')
    type('wa')
    await screen.findByText('I found 1 habit.')
    const list = screen.getByRole('listbox')
    expect(list.querySelectorAll('[data-list-motion], [data-sentence-change], [data-figure-motion]')).toHaveLength(0)
    for (const node of [list, ...list.querySelectorAll<HTMLElement>('*')]) {
      expect(node.style.animation).toBe('')
      expect(node.className.toString()).not.toMatch(/animate-|content-fade/)
    }
    expect(container.querySelectorAll('[data-asset="orbit-mascot"]')).toHaveLength(1)
  })

  it('keeps Orbit still under reduced motion and still swaps the face to Olhando', () => {
    mocks.reducedMotion = true
    const { field, mascot } = mount()
    expect(mascot().getAttribute('data-orbit-loop')).toBe('still')
    const eyesAtRest = mascot().innerHTML
    fireEvent.focus(field())
    expect(mascot().getAttribute('data-orbit-state')).toBe('olhando')
    expect(mascot().innerHTML).toBe(eyesAtRest)
  })

  it('finds no result dialog on the search route', async () => {
    mocks.query.mockReturnValue(result([habit('walk', 'Walk')]))
    mount()
    type('walk')
    await screen.findByText('Achei 1 hábito.')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText(ptBR.result.title)).toBeNull()
  })
})
