import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import type { HabitsFilter, NormalizedHabit } from '@orbit/shared/types/habit'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { renderedText } from '../support/react-test-renderer'
import SearchScreen from '@/app/search'
import { dismissTopOverlay } from '@/lib/overlay-stack'

vi.unmock('react-i18next')
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
vi.mock('@/components/ui/icons', async (importOriginal) => ({ ...await importOriginal<typeof import('@/components/ui/icons')>(), Circle: () => null, SkipForward: () => null }))
const mocks = vi.hoisted(() => ({ query: vi.fn(), push: vi.fn(), back: vi.fn(), log: vi.fn(), skip: vi.fn(), retry: vi.fn() }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: mocks.push, back: mocks.back }) }))
vi.mock('@/hooks/use-habits', () => ({ useHabits: (filters: HabitsFilter) => mocks.query(filters), useLogHabit: () => ({ mutate: mocks.log }), useSkipHabit: () => ({ mutate: mocks.skip }) }))
vi.mock('@/components/habits/create-habit-modal', () => ({ CreateHabitModal: (props: { open: boolean; initialTitle: string }) => props.open ? React.createElement('CreateForm', props) : null }))
vi.mock('@/lib/motion', () => ({ usePrefersReducedMotion: () => true }))

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')
type Tree = import('react-test-renderer').ReactTestRenderer
let tree: Tree

function result(habits: NormalizedHabit[], pending = false, error = false) {
  return { data: { topLevelHabits: habits, habitsById: new Map(habits.map((habit) => [habit.id, habit])), childrenByParent: new Map() }, isPending: pending, isFetching: pending, isSuccess: !pending && !error, isError: error, refetch: mocks.retry }
}

async function mount(locale = 'en') {
  const i18n = createInstance()
  await i18n.use(initReactI18next).init({ lng: locale, resources: { en: { translation: en }, 'pt-BR': { translation: ptBR } }, interpolation: { prefix: '{', suffix: '}', escapeValue: false } })
  await TestRenderer.act(() => { tree = TestRenderer.create(<I18nextProvider i18n={i18n}><SearchScreen /></I18nextProvider>) })
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
  mocks.query.mockReturnValue(result([]))
})
afterEach(async () => {
  await TestRenderer.act(() => tree.update(<></>))
  vi.useRealTimers()
})

describe('mobile search', () => {
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
    await pressLabel(locale === 'en' ? 'Open House routine' : 'Abrir House routine')
    expect(mocks.push).toHaveBeenCalledWith('/habits/parent')
    expect(mocks.query).toHaveBeenCalledWith({ search: 'walk', page: 1, pageSize: 20 })
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
    mocks.query.mockReturnValue(result([createMockHabit({ id: 'habit', title: 'Walk', isOverdue: true })]))
    await mount()
    await pressText(page === 'log' ? 'Log a habit' : 'Skip a habit')
    expect(mocks[page]).not.toHaveBeenCalled()
    expect(text()).not.toContain('Create habit')
    await pressLabel('Walk')
    expect(mocks[page]).toHaveBeenCalledWith(page === 'log' ? { habitId: 'habit', intent: 'log' } : { habitId: 'habit' }, expect.objectContaining({ onSuccess: expect.any(Function) }))
    await TestRenderer.act(() => { expect(dismissTopOverlay('system-back')).toBe(true) })
    expect(text()).toContain('Create habit')
    expect(mocks.back).not.toHaveBeenCalled()
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

  it('keeps the query and offers retry after a request fails', async () => {
    mocks.query.mockReturnValue(result([], false, true))
    await mount()
    await type('walk')
    await pressText('Retry')
    expect(mocks.retry).toHaveBeenCalled()
    expect(input().props.value).toBe('walk')
  })
})
