import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import type { NormalizedHabit, HabitsFilter } from '@orbit/shared/types/habit'
import { CommandMenu } from '@/components/command/command-menu'

const mocks = vi.hoisted(() => ({ pending: false, push: vi.fn(), log: vi.fn(), skip: vi.fn(), query: vi.fn(), retry: vi.fn(), wide: false }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/hooks/use-is-desktop', () => ({ useIsWideDesktop: () => mocks.wide }))
vi.mock('@/hooks/use-habit-queries', () => ({ useSearchHabits: (filters: HabitsFilter) => mocks.query(filters) }))
vi.mock('@/hooks/use-habits', () => ({ useLogHabit: () => ({ mutate: mocks.log, isPending: mocks.pending }), useSkipHabit: () => ({ mutate: mocks.skip, isPending: mocks.pending }) }))

function result(habits: NormalizedHabit[], pending = false, error = false) {
  return { data: { topLevelHabits: habits, habitsById: new Map(habits.map((habit) => [habit.id, habit])), childrenByParent: new Map(), totalCount: habits.length, totalPages: habits.length === 20 ? 2 : 1, currentPage: 1 }, isPending: pending, isFetching: pending, isSuccess: !pending && !error, isError: error, refetch: mocks.retry }
}

function mount(resultsMode = false, locale = 'en', onCreate = vi.fn()) {
  return render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ptBR}><CommandMenu resultsMode={resultsMode} navItems={[]} onCreateHabit={onCreate} onClose={vi.fn()} /></NextIntlClientProvider>)
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
    fireEvent.click(screen.getByRole('button', { name: locale === 'en' ? 'Open House routine' : 'Abrir House routine' }))
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

  it.each(['log', 'skip'] as const)('selects a habit only after opening the %s page', async (page) => {
    mocks.query.mockReturnValue(result([createMockHabit({ id: 'habit', title: 'Walk', isOverdue: true })]))
    mount()
    fireEvent.click(screen.getByRole('option', { name: page === 'log' ? 'Log a habit' : 'Skip a habit' }))
    expect(mocks[page]).not.toHaveBeenCalled()
    expect(screen.queryByText('Create habit')).toBeNull()
    fireEvent.click(screen.getByRole('option', { name: 'Walk' }))
    expect(mocks[page]).toHaveBeenCalledWith({ habitId: 'habit' }, expect.objectContaining({ onSuccess: expect.any(Function) }))
    mocks.pending = true
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'walk' } })
    const pendingOption = await screen.findByRole('option', { name: 'Walk' })
    expect(pendingOption).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(pendingOption)
    expect(mocks[page]).toHaveBeenCalledTimes(1)
  })

  it('keeps server matches selectable without moving input focus', async () => {
    mocks.query.mockReturnValue(result([createMockHabit({ id: 'stretch', title: 'Stretch', searchMatches: [{ field: 'tag', value: 'walking' }] })]))
    mount()
    const input = screen.getByRole('combobox')
    input.focus()
    fireEvent.change(input, { target: { value: 'walking' } })
    expect(await screen.findByText('“walking”')).toBeInTheDocument()
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    await waitFor(() => expect(screen.getAllByRole('option', { selected: true })).toHaveLength(1))
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
