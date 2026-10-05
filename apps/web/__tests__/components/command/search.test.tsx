import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import type { NormalizedHabit, HabitsFilter } from '@orbit/shared/types/habit'
import { createPaginatedSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { normalizeHabitQueryData } from '@orbit/shared/utils'
import { CommandMenu } from '@/components/command/command-menu'
import SearchPage from '@/app/(app)/search/page'
import { holdAccount, replaceAccountWith } from '@/__tests__/support/account-change'

const mocks = vi.hoisted(() => ({ showError: vi.fn(), pending: false, back: vi.fn(), push: vi.fn(), log: vi.fn(), skip: vi.fn(), query: vi.fn(), retry: vi.fn(), wide: false }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, back: mocks.back }) }))
vi.mock('@/hooks/use-is-desktop', () => ({ useIsWideDesktop: () => mocks.wide }))
vi.mock('@/hooks/use-habit-queries', () => ({ useSearchHabits: (filters: HabitsFilter) => mocks.query(filters) }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: mocks.showError }) }))
vi.mock('@/hooks/use-habits', () => ({ useLogHabit: () => ({ mutate: mocks.log, isPending: mocks.pending }), useSkipHabit: () => ({ mutate: mocks.skip, isPending: mocks.pending }) }))

function result(habits: NormalizedHabit[], pending = false, error = false) {
  return { data: { topLevelHabits: habits, habitsById: new Map(habits.map((habit) => [habit.id, habit])), childrenByParent: new Map(), totalCount: habits.length, totalPages: habits.length === 20 ? 2 : 1, currentPage: 1 }, isPending: pending, isFetching: pending, isSuccess: !pending && !error, isError: error, refetch: mocks.retry }
}

function mount(searchPage = false, locale = 'en', onCreate = vi.fn()) {
  return render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ptBR}>{searchPage ? <SearchPage /> : <CommandMenu navItems={[]} onCreateHabit={onCreate} onClose={vi.fn()} />}</NextIntlClientProvider>)
}

function descendantResult(depth: number) {
  const target = { ...createMockHabit({ id: 'child', title: 'Walk to the shop', searchMatches: [{ field: 'title', value: null }] }), children: [] }
  const branch = depth === 1 ? target : {
    ...createMockHabit({ id: 'middle', title: 'Errands', hasSubHabits: true, searchMatches: [{ field: 'child', value: target.title }] }), children: [target],
  }
  const response = createPaginatedSchema(habitScheduleItemSchema).parse({
    items: [{
      ...createMockHabit({ id: 'parent', title: 'House routine', hasSubHabits: true, searchMatches: depth === 1 ? [{ field: 'child', value: target.title }] : null }),
      linkedGoals: [], children: [{ ...createMockHabit({ id: 'sibling', title: 'Wash dishes' }), children: [] }, branch],
    }],
    page: 1, pageSize: 20, totalCount: 1, totalPages: 1,
  })
  return { ...result([]), data: normalizeHabitQueryData(response.items, response) }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.pending = false
  mocks.wide = false
  Element.prototype.scrollIntoView = vi.fn()
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  mocks.query.mockReturnValue(result([]))
})
afterEach(() => { Reflect.deleteProperty(navigator, 'onLine') })

describe('habit search', () => {
  it.each([412, 500, 840, 1440].flatMap((width) => ['en', 'pt-BR'].map((locale) => ({ width, locale }))))('shows only habit search at $width in $locale', async ({ width, locale }) => {
    mocks.wide = width >= 1024
    const messages = locale === 'en' ? en : ptBR
    mocks.query.mockReturnValue(result([
      createMockHabit({ id: 'walk', title: 'Walk', searchMatches: [{ field: 'title', value: null }] }),
      createMockHabit({ id: 'run', title: 'Run', searchMatches: [{ field: 'description', value: null }] }),
    ]))
    const page = render(<NextIntlClientProvider locale={locale} messages={messages}><SearchPage /></NextIntlClientProvider>)
    const input = screen.getByRole('combobox', { name: messages.habits.search.title })
    expect(input).toHaveAttribute('placeholder', messages.habits.search.title)
    expect(page.container.querySelectorAll('[data-command-group]')).toHaveLength(0)
    expect(page.container.querySelectorAll('kbd')).toHaveLength(0)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText(messages.command.groups.create)).toBeNull()
    expect(screen.queryByText(messages.command.groups.actions)).toBeNull()
    expect(screen.queryByText(messages.command.groups.destinations)).toBeNull()
    expect(screen.queryByText('2 habits')).toBeNull()
    fireEvent.change(input, { target: { value: 'walk' } })
    expect(await screen.findByText(locale === 'en' ? '2 habits' : '2 hábitos')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: locale === 'en' ? 'Open Walk in the name' : 'Abrir Walk no nome' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: locale === 'en' ? 'Open Run in the description' : 'Abrir Run na descrição' })).toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(2)
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mocks.push).toHaveBeenCalledWith('/habits/walk')
    mocks.query.mockReturnValue(result([]))
    fireEvent.change(input, { target: { value: 'yoga' } })
    expect(await screen.findByText('“yoga”')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: messages.habits.search.create })).toBeInTheDocument()
  })

  it('keeps the focused query and caret when the page crosses the wide breakpoint', async () => {
    mocks.query.mockReturnValue(result([createMockHabit({ id: 'walk', title: 'Walk', searchMatches: [{ field: 'title', value: null }] })]))
    const page = render(<NextIntlClientProvider locale="en" messages={en}><SearchPage /></NextIntlClientProvider>)
    const compactInput = screen.getByRole<HTMLInputElement>('combobox')
    fireEvent.change(compactInput, { target: { value: 'walk' } })
    compactInput.focus()
    compactInput.setSelectionRange(1, 3, 'backward')
    expect(await screen.findByText('1 habit')).toBeInTheDocument()
    mocks.wide = true
    page.rerender(<NextIntlClientProvider locale="en" messages={en}><SearchPage /></NextIntlClientProvider>)
    const wideInput = screen.getByRole<HTMLInputElement>('combobox', { name: en.habits.search.title })
    expect(wideInput).toHaveValue('walk')
    expect(wideInput).toHaveFocus()
    expect([wideInput.selectionStart, wideInput.selectionEnd]).toEqual([1, 3])
    expect(wideInput.selectionDirection).toBe('backward')
    expect(screen.getByText('1 habit')).toBeInTheDocument()
    wideInput.setSelectionRange(2, 4)
    mocks.wide = false
    page.rerender(<NextIntlClientProvider locale="en" messages={en}><SearchPage /></NextIntlClientProvider>)
    const restoredCompactInput = screen.getByRole<HTMLInputElement>('combobox')
    expect(restoredCompactInput).toHaveValue('walk')
    expect(restoredCompactInput).toHaveFocus()
    expect([restoredCompactInput.selectionStart, restoredCompactInput.selectionEnd]).toEqual([2, 4])
    expect(screen.getByText('1 habit')).toBeInTheDocument()
  })

  it('does not move focus to search when another control is focused across the breakpoint', () => {
    const page = render(<NextIntlClientProvider locale="en" messages={en}><SearchPage /></NextIntlClientProvider>)
    screen.getByRole('combobox').focus()
    const backButton = screen.getByRole('button', { name: en.common.back })
    backButton.focus()
    mocks.wide = true
    page.rerender(<NextIntlClientProvider locale="en" messages={en}><SearchPage /></NextIntlClientProvider>)
    expect(backButton).toHaveFocus()
    expect(screen.getByRole('combobox', { name: en.habits.search.title })).not.toHaveFocus()
  })

  it.each([['', true], ['walk', false]] as const)('shows one loading indicator for query "%s"', (query, skeleton) => {
    vi.useFakeTimers()
    try {
      mocks.query.mockReturnValue(result([], true))
      const palette = mount()
      if (query) fireEvent.change(screen.getByRole('combobox'), { target: { value: query } })
      act(() => { vi.advanceTimersByTime(301) })
      expect(palette.container.querySelectorAll('.skeleton-pulse').length > 0).toBe(skeleton)
      expect(screen.queryByRole('status')).toBe(skeleton ? null : screen.getByRole('status'))
    } finally { vi.useRealTimers() }
  })

  it.each([false, true])('shows only searching feedback for a pending query with wide=%s', (wide) => {
    vi.useFakeTimers()
    try {
      mocks.wide = wide
      mocks.query.mockReturnValue(result([], true))
      const page = render(<NextIntlClientProvider locale="en" messages={en}><SearchPage /></NextIntlClientProvider>)
      fireEvent.change(screen.getByRole('combobox', { name: en.habits.search.title }), { target: { value: 'walk' } })
      act(() => { vi.advanceTimersByTime(301) })
      expect(screen.getByRole('status')).toHaveTextContent('Searching')
      expect(page.container.querySelector('.skeleton-pulse')).toBeNull()
    } finally { vi.useRealTimers() }
  })

  it('keeps create in the palette and explains offline refusal', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    const onCreate = vi.fn()
    mount(false, 'en', onCreate)
    fireEvent.click(screen.getByRole('option', { name: 'Create habit' }))
    expect(screen.getByText(en.offline.create.reason)).toBeVisible()
    expect(onCreate).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'Create habit' })).toBeNull()
  })

  it.each([false, true])('explains offline refusal beside empty results with wide=%s', async (wide) => {
    mocks.wide = wide
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    render(<NextIntlClientProvider locale="en" messages={en}><SearchPage /></NextIntlClientProvider>)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'new habit' } })
    fireEvent.click(await screen.findByRole('button', { name: en.habits.search.create }))
    expect(screen.getByText(en.offline.create.reason)).toBeVisible()
    expect(screen.queryByRole('dialog', { name: 'Create habit' })).toBeNull()
  })
  it('selects the first habit when palette results load', async () => {
    mocks.query.mockReturnValue(result([], true))
    const view = mount()
    expect(screen.getByRole('option', { name: 'Create habit' })).toHaveAttribute('data-selected', 'true')
    mocks.query.mockReturnValue(result([
      createMockHabit({ id: 'walk', title: 'Walk' }),
      createMockHabit({ id: 'run', title: 'Run' }),
    ]))
    view.rerender(<NextIntlClientProvider locale="en" messages={en}><CommandMenu navItems={[]} onCreateHabit={vi.fn()} onClose={vi.fn()} /></NextIntlClientProvider>)
    await waitFor(() => expect(screen.getByRole('option', { name: 'Walk' })).toHaveAttribute('data-selected', 'true'))
  })

  it('keeps pointer movement separate from keyboard selection when search results load', async () => {
    mocks.query.mockReturnValue(result([], true))
    const view = render(<NextIntlClientProvider locale="en" messages={en}><SearchPage /></NextIntlClientProvider>)
    const input = screen.getByRole('combobox', { name: en.habits.search.title })
    fireEvent.change(input, { target: { value: 'walk' } })
    expect(screen.queryByRole('option')).toBeNull()
    mocks.query.mockReturnValue(result([
      createMockHabit({ id: 'walk', title: 'Walk', searchMatches: [{ field: 'title', value: null }] }),
      createMockHabit({ id: 'run', title: 'Run', searchMatches: [{ field: 'description', value: null }] }),
    ]))
    view.rerender(<NextIntlClientProvider locale="en" messages={en}><SearchPage /></NextIntlClientProvider>)
    const first = await screen.findByRole('option', { name: 'Open Walk in the name' })
    const second = screen.getByRole('option', { name: 'Open Run in the description' })
    await waitFor(() => expect(first).toHaveAttribute('aria-selected', 'true'))
    fireEvent.pointerMove(second)
    expect(first).toHaveAttribute('aria-selected', 'true')
    expect(second).toHaveAttribute('aria-selected', 'false')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mocks.push).toHaveBeenLastCalledWith('/habits/walk')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(first).toHaveAttribute('aria-selected', 'false')
    expect(second).toHaveAttribute('aria-selected', 'true')
    fireEvent.pointerMove(first)
    expect(second).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mocks.push).toHaveBeenLastCalledWith('/habits/run')
    fireEvent.click(first)
    expect(mocks.push).toHaveBeenLastCalledWith('/habits/walk')
  })

  it('does not offer destinations on the compact search page', async () => {
    render(<NextIntlClientProvider locale="en" messages={en}><SearchPage /></NextIntlClientProvider>)
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'Today' } })
    expect(await screen.findByText('“Today”')).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Today' })).toBeNull()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('uses the initial in search and palette habit rows', () => {
    mocks.query.mockReturnValue(result([createMockHabit({ id: 'walk', title: 'Walk', emoji: null })]))
    const palette = mount()
    const paletteWell = screen.getByRole('option', { name: 'Walk' }).firstElementChild
    expect(paletteWell).toHaveTextContent('W')
    expect(paletteWell?.querySelector('svg')).toBeNull()
    palette.unmount()
    mount(true)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'walk' } })
    return screen.findByRole('option', { name: /Open Walk/ }).then((option) => {
      expect(option.firstElementChild).toHaveTextContent('W')
      expect(option.querySelectorAll('svg')).toHaveLength(1)
    })
  })

  it.each(['en', 'pt-BR'])('renders the natural-case select copy with lowercase presentation in %s', (locale) => {
    mount(false, locale)
    const select = locale === 'en' ? en.command.hints.select : ptBR.command.hints.select
    expect(select).toBe(locale === 'en' ? 'Choose' : 'Escolher')
    expect(screen.getByText(select)).toHaveClass('lowercase')
  })

  it('sizes the palette habit glyph slot and emoji as drawn', () => {
    mocks.query.mockReturnValue(result([createMockHabit({ id: 'walk', title: 'Walk', emoji: '🚶' })]))
    mount()
    const well = screen.getByRole('option', { name: 'Walk' }).firstElementChild
    expect(well).toHaveClass('size-6')
    expect(well?.firstElementChild).toHaveClass('text-[18px]')
  })
  it('lets the shell scroll results while the palette keeps its own list scroller', () => {
    const page = mount(true)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'walk' } })
    expect(page.container.querySelector('[cmdk-list]')).not.toHaveClass('overflow-y-auto')
    page.unmount()
    const palette = mount(false)
    expect(palette.container.querySelector('[cmdk-list]')).toHaveClass('overflow-y-auto')
  })
  it('clears the search box when another account replaces the tab', async () => {
    vi.stubGlobal('fetch', vi.fn())
    holdAccount('user-1')
    mocks.query.mockReturnValue(result([createMockHabit({ title: 'Walk', searchMatches: [{ field: 'title', value: null }] })]))
    render(<NextIntlClientProvider locale="en" messages={en}><SearchPage /></NextIntlClientProvider>)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'walk' } })
    expect(screen.getByRole('combobox')).toHaveValue('walk')

    await replaceAccountWith('user-2')

    expect(screen.getByRole('combobox')).toHaveValue('')
  })

  it.each([false, true])('clears an offline create refusal when the account changes with wide=%s', async (wide) => {
    mocks.wide = wide
    vi.stubGlobal('fetch', vi.fn())
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    holdAccount('user-1')
    mount(true)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'yoga' } })
    fireEvent.click(await screen.findByRole('button', { name: en.habits.search.create }))
    expect(screen.getByText(en.offline.create.reason)).toBeVisible()

    await replaceAccountWith('user-2')

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'reading' } })
    await screen.findByText('“reading”')
    expect(screen.queryByText(en.offline.create.reason)).toBeNull()
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it.each(['', 'walk'])('leaves the standalone search page on Escape with query "%s"', async (query) => {
    mocks.query.mockReturnValue(result([createMockHabit({ title: 'Walk', searchMatches: [{ field: 'title', value: null }] })]))
    render(<NextIntlClientProvider locale="en" messages={en}><SearchPage /></NextIntlClientProvider>)
    const input = screen.getByRole('combobox')
    if (query) {
      fireEvent.change(input, { target: { value: query } })
      expect(await screen.findByText('1 habit')).toBeInTheDocument()
    }
    expect(screen.queryByText(en.command.hints.close)).toBeNull()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(mocks.back).toHaveBeenCalledTimes(1)
  })

  it('pushes creation from empty search and keeps its query and return path', async () => {
    render(<NextIntlClientProvider locale="en" messages={en}><SearchPage /></NextIntlClientProvider>)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'yoga' } })
    fireEvent.click(await screen.findByRole('button', { name: en.habits.search.create }))
    expect(mocks.push).toHaveBeenCalledWith('/habits/new?title=yoga&from=%2Fsearch')
    expect(mocks.back).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it.each(['en', 'pt-BR'])('renders all four match fields and opens the parent in %s', async (locale) => {
    const habits = [
      createMockHabit({ id: 'name', title: 'Walk', searchMatches: [{ field: 'title', value: null }] }),
      createMockHabit({ id: 'description', title: 'Park run', searchMatches: [{ field: 'description', value: null }] }),
      createMockHabit({ id: 'tag', title: 'Stretch', searchMatches: [{ field: 'tag', value: 'walking' }] }),
      createMockHabit({ id: 'parent', title: 'House routine', searchMatches: [{ field: 'child', value: 'Walk to the shop' }] }),
    ]
    mocks.query.mockReturnValue(result(habits))
    mount(true, locale)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'walk' } })
    expect(await screen.findByText(locale === 'en' ? 'in the name' : 'no nome')).toBeInTheDocument()
    expect(screen.getByText(locale === 'en' ? 'in the description' : 'na descrição')).toBeInTheDocument()
    expect(screen.getByText('“walking”')).toBeInTheDocument()
    expect(screen.getByText('“Walk to the shop”')).toBeInTheDocument()
    expect(screen.getByText(locale === 'en' ? '4 habits' : '4 hábitos')).toBeInTheDocument()
    const expectedNames = locale === 'en'
      ? ['Open Walk in the name', 'Open Park run in the description', 'Open Stretch in the tag “walking”', 'Open House routine inside “Walk to the shop”']
      : ['Abrir Walk no nome', 'Abrir Park run na descrição', 'Abrir Stretch na etiqueta “walking”', 'Abrir House routine dentro de “Walk to the shop”']
    screen.getAllByRole('option').forEach((option, index) => expect(option).toHaveAccessibleName(expectedNames[index]))
    fireEvent.click(screen.getByRole('option', { name: expectedNames[3] }))
    expect(mocks.push).toHaveBeenCalledWith('/habits/parent')
    expect(mocks.query).toHaveBeenCalledWith({ search: 'walk', page: 1, pageSize: 20 })
  })

  it('renders one result with the singular count', async () => {
    mocks.query.mockReturnValue(result([createMockHabit({ title: 'Walk', searchMatches: [{ field: 'title', value: null }] })]))
    mount(true)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'walk' } })
    expect(await screen.findByText('1 habit')).toBeInTheDocument()
  })

  it('names an empty query and passes its name to the create action', async () => {
    const create = vi.fn()
    mount(true, 'en', create)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'yoga' } })
    const button = await screen.findByRole('button', { name: 'Create habit' })
    expect(screen.getByText('“yoga”')).toBeInTheDocument()
    expect(screen.getByText('No habit with that name, that description or that tag.')).toBeInTheDocument()
    fireEvent.click(button)
    expect(mocks.push).toHaveBeenCalledWith('/habits/new?title=yoga&from=%2Fsearch')
    expect(create).not.toHaveBeenCalled()
  })

  it('keeps typing usable and withholds loading feedback for 300ms', async () => {
    mocks.query.mockReturnValue(result([], true))
    mount()
    expect(screen.queryByRole('status')).toBeNull()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'walk' } })
    expect(await screen.findByRole('status')).toHaveTextContent('Searching')
    expect(screen.getByRole('status')).toHaveAccessibleName('Searching')
    expect(screen.getByRole('combobox')).toHaveValue('walk')
    expect(screen.queryByText('Nothing by that name.')).toBeNull()
    expect(screen.getByRole('listbox')).toHaveAttribute('aria-busy', 'true')
  })

  it('distinguishes a total no match from absent command groups', async () => {
    mount()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'zzz' } })
    expect(await screen.findByText('Nothing by that name.')).toBeInTheDocument()
    expect(screen.queryByText('Create')).toBeNull()
    expect(screen.queryByText('Actions')).toBeNull()
  })

  it('leaves a rejected log to the mutation error toast and lets the person retry', async () => {
    mocks.query.mockReturnValue(result([createMockHabit({ id: 'habit', title: 'Walk' })]))
    mocks.log.mockImplementation((_input, options: { onError?: (error: Error) => void }) => options.onError?.(new Error('Rejected')))
    mount()
    fireEvent.click(screen.getByRole('option', { name: 'Log a habit' }))
    fireEvent.click(screen.getByRole('option', { name: 'Walk' }))
    expect(mocks.log).toHaveBeenCalledWith({ habitId: 'habit', intent: 'log' }, { onSuccess: expect.any(Function) })
    expect(mocks.showError).not.toHaveBeenCalled()
    expect(screen.getByRole('option', { name: 'Walk' })).not.toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(screen.getByRole('option', { name: 'Walk' }))
    expect(mocks.log).toHaveBeenCalledTimes(2)
  })

  it('reports a rejected skip and lets the person retry', async () => {
    mocks.query.mockReturnValue(result([createMockHabit({ id: 'habit', title: 'Walk' })]))
    mocks.skip.mockImplementation((_input, options: { onError?: (error: Error) => void }) => options.onError?.(new Error('Rejected')))
    mount()
    fireEvent.click(screen.getByRole('option', { name: 'Skip a habit' }))
    fireEvent.click(screen.getByRole('option', { name: 'Walk' }))
    expect(mocks.showError).toHaveBeenCalledWith(en.errors.updateHabit)
    expect(screen.queryByText('Create habit')).toBeNull()
    expect(screen.getByRole('option', { name: 'Walk' })).not.toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(screen.getByRole('option', { name: 'Walk' }))
    expect(mocks.skip).toHaveBeenCalledTimes(2)
  })

  it.each(['log', 'skip'] as const)('selects a habit only after opening the %s page', async (page) => {
    mocks.query.mockReturnValue(result([createMockHabit({ id: 'habit', title: 'Walk', isOverdue: true, searchMatches: [{ field: 'title', value: null }] })]))
    mount()
    fireEvent.click(screen.getByRole('option', { name: page === 'log' ? 'Log a habit' : 'Skip a habit' }))
    expect(mocks[page]).not.toHaveBeenCalled()
    expect(screen.queryByText('Create habit')).toBeNull()
    fireEvent.click(screen.getByRole('option', { name: 'Walk' }))
    expect(mocks[page]).toHaveBeenCalledWith(
      page === 'log' ? { habitId: 'habit', intent: 'log' } : { habitId: 'habit' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
    mocks.pending = true
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'walk' } })
    const pendingOption = await screen.findByRole('option', { name: /^Walk/ })
    expect(pendingOption).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(pendingOption)
    expect(mocks[page]).toHaveBeenCalledTimes(1)
  })

  it.each([{ page: 'log', depth: 1 }, { page: 'skip', depth: 1 }, { page: 'log', depth: 2 }, { page: 'skip', depth: 2 }] as const)('targets the descendant on the $page page at depth $depth', async ({ page, depth }) => {
    mocks.query.mockReturnValue(descendantResult(depth))
    mount()
    fireEvent.click(screen.getByRole('option', { name: page === 'log' ? 'Log a habit' : 'Skip a habit' }))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'walk' } })
    await waitFor(() => expect(mocks.query).toHaveBeenLastCalledWith({ search: 'walk', page: 1, pageSize: 20 }))
    await waitFor(() => expect(screen.getByRole('listbox')).toHaveAttribute('aria-busy', 'false'))
    fireEvent.click(screen.getAllByRole('option')[0]!)
    expect(mocks[page]).toHaveBeenCalledWith(
      page === 'log' ? { habitId: 'child', intent: 'log' } : { habitId: 'child' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
    expect(screen.getAllByRole('option')).toHaveLength(1)
    expect(screen.getByRole('option')).toHaveTextContent('Walk to the shop')
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('keeps server matches selectable without moving input focus', async () => {
    mocks.query.mockReturnValue(result([createMockHabit({ id: 'stretch', title: 'Stretch', searchMatches: [{ field: 'tag', value: 'walking' }] }), createMockHabit({ id: 'walk', title: 'Walk', searchMatches: [{ field: 'title', value: null }] })]))
    mount(true)
    const input = screen.getByRole('combobox')
    input.focus()
    fireEvent.change(input, { target: { value: 'walking' } })
    expect(await screen.findByText('“walking”')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('option', { selected: true })).toHaveAccessibleName('Open Stretch in the tag “walking”'))
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    await waitFor(() => expect(screen.getByRole('option', { selected: true })).toHaveAccessibleName('Open Walk in the name'))
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    await waitFor(() => expect(screen.getByRole('option', { selected: true })).toHaveAccessibleName('Open Stretch in the tag “walking”'))
    expect(input).toHaveFocus()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mocks.push).toHaveBeenCalledWith('/habits/stretch')
  })

  it.each([false, true])('pages search results and resets for a different query with wide=%s', async (wide) => {
    mocks.wide = wide
    mocks.query.mockReturnValue(result(Array.from({ length: 20 }, (_, index) => createMockHabit({ id: String(index), title: `Walk ${index}`, searchMatches: [{ field: 'title', value: null }] }))))
    mount(true)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'walk' } })
    await screen.findByRole('option', { name: 'Open Walk 0 in the name' })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(mocks.query).toHaveBeenLastCalledWith({ search: 'walk', page: 2, pageSize: 20 })
    expect(screen.getByRole('button', { name: 'Previous' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'run' } })
    expect(screen.queryByRole('button', { name: 'Previous' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    await waitFor(() => expect(mocks.query).toHaveBeenLastCalledWith({ search: 'run', page: 1, pageSize: 20 }))
  })

  it('does not offer another page when the last page contains twenty results', () => {
    const response = result(Array.from({ length: 20 }, (_, index) => createMockHabit({ id: String(index) })))
    response.data.totalPages = 1
    mocks.query.mockReturnValue(response)
    mount()
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull()
  })

  it.each([[false, 'primary'], [true, 'secondary']] as const)('uses the no-results action variant for wide=%s', async (wide, variant) => {
    mocks.wide = wide
    mount(true)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'yoga' } })
    expect(await screen.findByRole('button', { name: 'Create habit' })).toHaveAttribute('data-variant', variant)
  })

  it.each([false, true])('offers retry on the search page while preserving the query with wide=%s', async (wide) => {
    mocks.wide = wide
    mocks.query.mockReturnValue(result([], false, true))
    mount(true)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'walk' } })
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(mocks.retry).toHaveBeenCalled()
    expect(screen.getByRole('combobox')).toHaveValue('walk')
  })
})
