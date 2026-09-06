import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import type { HabitsFilter, NormalizedHabit } from '@orbit/shared/types/habit'
import { createPaginatedSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { normalizeHabitQueryData } from '@orbit/shared/utils'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { renderedText } from '../support/react-test-renderer'
import SearchScreen from '@/app/search'
import { dismissTopOverlay } from '@/lib/overlay-stack'

vi.unmock('react-i18next')
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
vi.mock('@/components/ui/icons', async (importOriginal) => ({ ...await importOriginal<typeof import('@/components/ui/icons')>(), Circle: () => null, SkipForward: () => null }))
const mocks = vi.hoisted(() => ({ query: vi.fn(), pending: false, push: vi.fn(), back: vi.fn(), log: vi.fn(), skip: vi.fn(), retry: vi.fn() }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: mocks.push, back: mocks.back }) }))
vi.mock('@/hooks/use-habit-queries', () => ({ useSearchHabits: (filters: HabitsFilter) => mocks.query(filters) }))
vi.mock('@/hooks/use-habits', () => ({ useLogHabit: () => ({ mutate: mocks.log, isPending: mocks.pending }), useSkipHabit: () => ({ mutate: mocks.skip, isPending: mocks.pending }) }))
vi.mock('@/components/habits/create-habit-modal', () => ({ CreateHabitModal: (props: { open: boolean; initialTitle: string }) => props.open ? React.createElement('CreateForm', props) : null }))
vi.mock('@/lib/motion', () => ({ usePrefersReducedMotion: () => true }))

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')
type Tree = import('react-test-renderer').ReactTestRenderer
let tree: Tree

function result(habits: NormalizedHabit[], pending = false, error = false) {
  return { data: { topLevelHabits: habits, habitsById: new Map(habits.map((habit) => [habit.id, habit])), childrenByParent: new Map(), totalCount: habits.length, totalPages: habits.length === 20 ? 2 : 1, currentPage: 1 }, isPending: pending, isFetching: pending, isSuccess: !pending && !error, isError: error, refetch: mocks.retry }
}

async function mount(locale = 'en') {
  const i18n = createInstance()
  await i18n.use(initReactI18next).init({ lng: locale, resources: { en: { translation: en }, 'pt-BR': { translation: ptBR } }, interpolation: { prefix: '{', suffix: '}', escapeValue: false } })
  await TestRenderer.act(() => { tree = TestRenderer.create(<I18nextProvider i18n={i18n}><SearchScreen /></I18nextProvider>) })
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

function text() { return tree.root.findAll((node) => String(node.type) === 'Text').map((node) => renderedText(node.props.children)).join(' ') }
function host(kind: string) {
  const node = tree.root.findAll((node) => String(node.type) === kind)[0]
  if (!node) throw new Error('Missing ' + kind)
  return node
}
function input() { return host('TextInput') }
async function type(query: string) {
  await TestRenderer.act(() => { (input().props.onChangeText as (value: string) => void)(query) })
  await TestRenderer.act(() => { vi.advanceTimersByTime(300) })
}
async function pressLabel(label: string) {
  const control = tree.root.findAll((node) => String(node.type) === 'Pressable' && node.props.accessibilityLabel === label)[0]
  if (!control || typeof control.props.onPress !== 'function') throw new Error('Missing control: ' + label)
  const onPress = control.props.onPress as () => void
  await TestRenderer.act(() => { onPress() })
}
async function pressText(label: string) {
  const control = tree.root.findAll((node) => String(node.type) === 'Pressable' && node.findAll((child) => String(child.type) === 'Text' && child.props.children === label).length > 0)[0]
  if (!control || typeof control.props.onPress !== 'function') throw new Error('Missing control: ' + label)
  const onPress = control.props.onPress as () => void
  await TestRenderer.act(() => { onPress() })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  mocks.pending = false
  mocks.query.mockReturnValue(result([]))
})
afterEach(async () => {
  await TestRenderer.act(() => tree.update(<></>))
  vi.useRealTimers()
})

describe('mobile search', () => {
  it('keeps the habit group before create, actions and destinations', async () => {
    mocks.query.mockReturnValue(result([createMockHabit({ title: 'Walk' })]))
    await mount()
    const headings = tree.root.findAll((node) => String(node.type) === 'Text' && node.props.accessibilityRole === 'header').map((node) => renderedText(node.props.children))
    expect(headings).toEqual(['Search habits', 'Habits', 'Create', 'Actions', 'Go to'])
  })

  it.each(['en', 'pt-BR'])('shows all match kinds and navigates to the parent in %s', async (locale) => {
    mocks.query.mockReturnValue(result([
      createMockHabit({ id: 'title', title: 'Walk', searchMatches: [{ field: 'title', value: null }] }),
      createMockHabit({ id: 'description', title: 'Run', searchMatches: [{ field: 'description', value: null }] }),
      createMockHabit({ id: 'tag', title: 'Stretch', searchMatches: [{ field: 'tag', value: 'walking' }] }),
      createMockHabit({ id: 'parent', title: 'House routine', searchMatches: [{ field: 'child', value: 'Walk to the shop' }] }),
    ]))
    await mount(locale)
    await type('walk')
    expect(text()).toContain(locale === 'en' ? 'in the name' : 'no nome')
    expect(text()).toContain(locale === 'en' ? 'in the description' : 'na descrição')
    expect(text()).toContain('“walking”')
    expect(text()).toContain('“Walk to the shop”')
    expect(text()).toContain(locale === 'en' ? '4 habits' : '4 hábitos')
    const expectedNames = locale === 'en'
      ? ['Open Walk in the name', 'Open Run in the description', 'Open Stretch in the tag “walking”', 'Open House routine inside “Walk to the shop”']
      : ['Abrir Walk no nome', 'Abrir Run na descrição', 'Abrir Stretch na etiqueta “walking”', 'Abrir House routine dentro de “Walk to the shop”']
    const results = tree.root.findAll((node) => String(node.type) === 'Pressable' && node.props.role === 'button')
    expect(results.map((node) => node.props.accessibilityLabel)).toEqual(expectedNames)
    await pressLabel(expectedNames[3]!)
    expect(mocks.push).toHaveBeenCalledWith('/habits/parent')
    expect(mocks.query).toHaveBeenCalledWith({ search: 'walk', page: 1, pageSize: 20 })
  })

  it('marks exactly one palette option as the current position', async () => {
    await mount()
    const selected = tree.root.findAll((node) => String(node.type) === 'Pressable' && node.props.role === 'option' && (node.props.accessibilityState as { selected: boolean }).selected)
    expect(selected).toHaveLength(1)
    expect(renderedText(selected[0]?.props.children)).toContain('Create habit')
  })

  it('shows one result with the singular count', async () => {
    mocks.query.mockReturnValue(result([createMockHabit({ title: 'Walk' })]))
    await mount()
    await type('walk')
    expect(text()).toContain('1 habit')
    expect(tree.root.findAll((node) => String(node.type) === 'Pressable' && node.props.accessibilityLabel === 'Open Walk')).toHaveLength(1)
  })

  it('quotes an empty query and carries it into the create form', async () => {
    await mount()
    await type('yoga')
    expect(text()).toContain('“yoga”')
    expect(text()).toContain('No habit with that name, that description or that tag.')
    await pressText('Create with that name')
    expect(host('CreateForm').props.initialTitle).toBe('yoga')
  })

  it('delays searching feedback while preserving editable input', async () => {
    mocks.query.mockReturnValue(result([], true))
    await mount()
    expect(text()).not.toContain('Searching')
    await type('walk')
    expect(text()).toContain('Searching')
    expect(input().props.value).toBe('walk')
    expect(input().props.editable).toBe(true)
    expect(text()).not.toContain('Nothing by that name.')
  })

  it.each(['log', 'skip'] as const)('opens the %s page, performs the selected action, and backs out first', async (page) => {
    mocks.query.mockReturnValue(result([createMockHabit({ id: 'habit', title: 'Walk', isOverdue: true, searchMatches: [{ field: 'title', value: null }] })]))
    await mount()
    await pressText(page === 'log' ? 'Log a habit' : 'Skip a habit')
    expect(mocks[page]).not.toHaveBeenCalled()
    expect(text()).not.toContain('Create habit')
    await pressLabel('Walk')
    expect(mocks[page]).toHaveBeenCalledWith(page === 'log' ? { habitId: 'habit', intent: 'log' } : { habitId: 'habit' }, expect.objectContaining({ onSuccess: expect.any(Function) }))
    mocks.pending = true
    await type('walk')
    await pressLabel('Walk in the name')
    expect(mocks[page]).toHaveBeenCalledTimes(1)
    await TestRenderer.act(() => { expect(dismissTopOverlay('system-back')).toBe(true) })
    expect(text()).toContain('Create habit')
    expect(mocks.back).not.toHaveBeenCalled()
  })

  it.each([{ page: 'log', depth: 1 }, { page: 'skip', depth: 1 }, { page: 'log', depth: 2 }, { page: 'skip', depth: 2 }] as const)('targets the descendant on the $page page at depth $depth', async ({ page, depth }) => {
    mocks.query.mockReturnValue(descendantResult(depth))
    await mount()
    await pressText(page === 'log' ? 'Log a habit' : 'Skip a habit')
    await type('walk')
    expect(mocks.query).toHaveBeenLastCalledWith({ search: 'walk', page: 1, pageSize: 20 })
    const choices = tree.root.findAll((node) => String(node.type) === 'Pressable' && node.props.role === 'option')
    const onPress = choices[0]!.props.onPress as () => void
    await TestRenderer.act(() => { onPress() })
    expect(mocks[page]).toHaveBeenCalledWith(page === 'log' ? { habitId: 'child', intent: 'log' } : { habitId: 'child' }, expect.objectContaining({ onSuccess: expect.any(Function) }))
    expect(choices).toHaveLength(1)
    expect(choices[0]!.props.accessibilityLabel).toBe('Walk to the shop in the name')
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('shows a total no match on an empty action page', async () => {
    await mount()
    await pressText('Log a habit')
    await type('zzz')
    expect(text()).toContain('Nothing by that name.')
    expect(text()).not.toContain('Create with that name')
  })

  it('pages past twenty and resets the page when the query changes', async () => {
    mocks.query.mockReturnValue(result(Array.from({ length: 20 }, (_, index) => createMockHabit({ id: String(index) }))))
    await mount()
    await pressText('Next')
    expect(mocks.query).toHaveBeenLastCalledWith({ search: '', page: 2, pageSize: 20 })
    await type('walk')
    expect(mocks.query).toHaveBeenLastCalledWith({ search: 'walk', page: 1, pageSize: 20 })
  })

  it('does not offer another page when the last page contains twenty results', async () => {
    const response = result(Array.from({ length: 20 }, (_, index) => createMockHabit({ id: String(index) })))
    response.data.totalPages = 1
    mocks.query.mockReturnValue(response)
    await mount()
    expect(text()).not.toContain('Next')
  })

  it('keeps the query and offers retry after a request fails', async () => {
    mocks.query.mockReturnValue(result([], false, true))
    await mount()
    await type('walk')
    await pressText('Retry')
    expect(mocks.retry).toHaveBeenCalled()
    expect(input().props.value).toBe('walk')
  })
})
