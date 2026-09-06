import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import type { NormalizedHabit, HabitsFilter } from '@orbit/shared/types/habit'
import { createPaginatedSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { normalizeHabitQueryData } from '@orbit/shared/utils'
import { CommandMenu } from '@/components/command/command-menu'

const mocks = vi.hoisted(() => ({ showError: vi.fn(), pending: false, push: vi.fn(), log: vi.fn(), skip: vi.fn(), query: vi.fn(), retry: vi.fn(), wide: false }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
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

describe('habit search', () => {
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
    const button = await screen.findByRole('button', { name: 'Create with that name' })
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

  it.each(['log', 'skip'] as const)('reports a rejected %s and lets the person retry', async (page) => {
    mocks.query.mockReturnValue(result([createMockHabit({ id: 'habit', title: 'Walk' })]))
    mocks[page].mockImplementation((_input, options: { onError?: (error: Error) => void }) => options.onError?.(new Error('Rejected')))
    mount()
    fireEvent.click(screen.getByRole('option', { name: page === 'log' ? 'Log a habit' : 'Skip a habit' }))
    fireEvent.click(screen.getByRole('option', { name: 'Walk' }))
    expect(mocks.showError).toHaveBeenCalledWith(en.errors.updateHabit)
    expect(screen.queryByText('Create habit')).toBeNull()
    expect(screen.getByRole('option', { name: 'Walk' })).not.toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(screen.getByRole('option', { name: 'Walk' }))
    expect(mocks[page]).toHaveBeenCalledTimes(2)
  })

  it.each(['log', 'skip'] as const)('selects a habit only after opening the %s page', async (page) => {
    mocks.query.mockReturnValue(result([createMockHabit({ id: 'habit', title: 'Walk', isOverdue: true, searchMatches: [{ field: 'title', value: null }] })]))
    mount()
    fireEvent.click(screen.getByRole('option', { name: page === 'log' ? 'Log a habit' : 'Skip a habit' }))
    expect(mocks[page]).not.toHaveBeenCalled()
    expect(screen.queryByText('Create habit')).toBeNull()
    fireEvent.click(screen.getByRole('option', { name: 'Walk' }))
    expect(mocks[page]).toHaveBeenCalledWith({ habitId: 'habit' }, expect.objectContaining({ onSuccess: expect.any(Function) }))
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
    expect(mocks[page]).toHaveBeenCalledWith({ habitId: 'child' }, expect.objectContaining({ onSuccess: expect.any(Function) }))
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
    expect(await screen.findByRole('button', { name: 'Create with that name' })).toHaveAttribute('data-variant', variant)
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
