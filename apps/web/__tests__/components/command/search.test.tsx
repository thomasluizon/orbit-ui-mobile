import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
vi.mock('@/components/habits/create-habit-modal', async () => {
  const { Sheet } = await import('@/components/ui/sheet')
  return { CreateHabitModal: ({ onOpenChange }: { onOpenChange: (open: boolean) => void }) => <Sheet title="Create habit" onClose={() => onOpenChange(false)}><button type="button">Create action</button></Sheet> }
})
vi.mock('@/hooks/use-is-desktop', () => ({ useIsWideDesktop: () => mocks.wide }))
vi.mock('@/hooks/use-habit-queries', () => ({ useSearchHabits: (filters: HabitsFilter) => mocks.query(filters) }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: mocks.showError }) }))
vi.mock('@/hooks/use-habits', () => ({ useLogHabit: () => ({ mutate: mocks.log, isPending: mocks.pending }), useSkipHabit: () => ({ mutate: mocks.skip, isPending: mocks.pending }) }))

function result(habits: NormalizedHabit[], pending = false, error = false) {
  return { data: { topLevelHabits: habits, habitsById: new Map(habits.map((habit) => [habit.id, habit])), childrenByParent: new Map(), totalCount: habits.length, totalPages: habits.length === 20 ? 2 : 1, currentPage: 1 }, isPending: pending, isFetching: pending, isSuccess: !pending && !error, isError: error, refetch: mocks.retry }
}

function mount(resultsMode = false, locale = 'en', onCreate = vi.fn()) {
  return render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ptBR}><CommandMenu resultsMode={resultsMode} navItems={[]} onCreateHabit={onCreate} onClose={vi.fn()} /></NextIntlClientProvider>)
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
  it.each([false, true])('keeps create in the %s command surface and explains offline refusal', (resultsMode) => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    const onCreate = vi.fn()
    if (resultsMode) {
      render(<NextIntlClientProvider locale="en" messages={en}><SearchPage /></NextIntlClientProvider>)
    } else mount(false, 'en', onCreate)
    fireEvent.click(screen.getByRole('option', { name: 'Create habit' }))
    expect(screen.getByText(en.offline.create.reason)).toBeVisible()
    expect(onCreate).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'Create habit' })).toBeNull()
  })

  it('explains offline refusal beside empty search results', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    render(<NextIntlClientProvider locale="en" messages={en}><SearchPage /></NextIntlClientProvider>)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'new habit' } })
    fireEvent.click(await screen.findByRole('button', { name: en.habits.search.create }))
    expect(screen.getByText(en.offline.create.reason)).toBeVisible()
    expect(screen.queryByRole('dialog', { name: 'Create habit' })).toBeNull()
  })
  it.each([false, true])('selects the first habit when results load in resultsMode=%s', async (resultsMode) => {
    mocks.query.mockReturnValue(result([], true))
    const view = mount(resultsMode)
    expect(screen.getByRole('option', { name: 'Create habit' })).toHaveAttribute('data-selected', 'true')
    mocks.query.mockReturnValue(result([
      createMockHabit({ id: 'walk', title: 'Walk' }),
      createMockHabit({ id: 'run', title: 'Run' }),
    ]))
    view.rerender(<NextIntlClientProvider locale="en" messages={en}><CommandMenu resultsMode={resultsMode} navItems={[]} onCreateHabit={vi.fn()} onClose={vi.fn()} /></NextIntlClientProvider>)
    await waitFor(() => expect(screen.getByRole('option', { name: 'Walk' })).toHaveAttribute('data-selected', 'true'))
  })

  it('selects the first habit when the compact search page loads', async () => {
    mocks.query.mockReturnValue(result([], true))
    const view = render(<NextIntlClientProvider locale="en" messages={en}><SearchPage /></NextIntlClientProvider>)
    expect(screen.getByRole('option', { name: 'Create habit' })).toHaveAttribute('data-selected', 'true')
    mocks.query.mockReturnValue(result([
      createMockHabit({ id: 'walk', title: 'Walk' }),
      createMockHabit({ id: 'run', title: 'Run' }),
    ]))
    view.rerender(<NextIntlClientProvider locale="en" messages={en}><SearchPage /></NextIntlClientProvider>)
    await waitFor(() => expect(screen.getByRole('option', { name: 'Walk' })).toHaveAttribute('data-selected', 'true'))
  })

  it('selects and opens a destination-only search on the compact page', async () => {
    render(<NextIntlClientProvider locale="en" messages={en}><SearchPage /></NextIntlClientProvider>)
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'Today' } })
    const destination = screen.getByRole('option', { name: 'Today' })
    expect(destination).toHaveAttribute('data-selected', 'true')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mocks.push).toHaveBeenCalledWith('/')
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

  it.each(['', 'walk'])('leaves the standalone search page on Escape with query "%s"', async (query) => {
    mocks.query.mockReturnValue(result([createMockHabit({ title: 'Walk', searchMatches: [{ field: 'title', value: null }] })]))
    render(<NextIntlClientProvider locale="en" messages={en}><SearchPage /></NextIntlClientProvider>)
    const input = screen.getByRole('combobox')
    if (query) {
      fireEvent.change(input, { target: { value: query } })
      expect(await screen.findByText('1 habit')).toBeInTheDocument()
    }
    expect(screen.getByText(en.command.hints.close)).toBeInTheDocument()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(mocks.back).toHaveBeenCalledTimes(1)
  })

  it.each(['log', 'skip'] as const)('backs out of %s before Escape leaves the standalone search page', (page) => {
    render(<NextIntlClientProvider locale="en" messages={en}><SearchPage /></NextIntlClientProvider>)
    fireEvent.click(screen.getByRole('option', { name: page === 'log' ? 'Log a habit' : 'Skip a habit' }))
    expect(screen.getByText(en.command.hints.back)).toBeInTheDocument()
    expect(screen.queryByText(en.command.hints.close)).toBeNull()
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' })
    expect(mocks.back).not.toHaveBeenCalled()
    expect(screen.getByRole('option', { name: 'Create habit' })).toBeInTheDocument()
    expect(screen.getByText(en.command.hints.close)).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' })
    expect(mocks.back).toHaveBeenCalledTimes(1)
  })

  it('dismisses the create sheet before Escape leaves the standalone search page', async () => {
    render(<NextIntlClientProvider locale="en" messages={en}><SearchPage /></NextIntlClientProvider>)
    fireEvent.click(screen.getByRole('option', { name: 'Create habit' }))
    expect(mocks.back).not.toHaveBeenCalled()
    const dialog = await screen.findByRole('dialog', { name: 'Create habit' })
    await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement))
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(mocks.back).not.toHaveBeenCalled()
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' })
    expect(mocks.back).toHaveBeenCalledTimes(1)
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
    expect(create).toHaveBeenCalledWith('yoga')
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
    mount(true)
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

  it('pages past twenty and resets to the first page for a different query', async () => {
    mocks.query.mockReturnValue(result(Array.from({ length: 20 }, (_, index) => createMockHabit({ id: String(index), title: `Walk ${index}`, isOverdue: true }))))
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(mocks.query).toHaveBeenLastCalledWith({ search: '', page: 2, pageSize: 20 })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'run' } })
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

  it('offers retry on failure while preserving the query', async () => {
    mocks.query.mockReturnValue(result([], false, true))
    mount()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'walk' } })
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(mocks.retry).toHaveBeenCalled()
    expect(screen.getByRole('combobox')).toHaveValue('walk')
  })
})
