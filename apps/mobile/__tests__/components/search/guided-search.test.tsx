import React from 'react'
import { StyleSheet, type PressableProps, type ViewStyle } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { enableTestFlags } from '@orbit/shared/test-support/flag-state'
import type { HabitsFilter, NormalizedHabit } from '@orbit/shared/types/habit'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import SearchScreen from '@/app/search'
import { i18n } from '@/lib/i18n'
import { __emitKeyboardEvent } from '@/test-mocks/react-native'
import { reanimatedTestState } from '@/test-mocks/react-native-reanimated'
import { renderedText } from '../../support/react-test-renderer'

vi.unmock('react-i18next')
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
const mocks = vi.hoisted(() => ({ query: vi.fn(), showError: vi.fn(), push: vi.fn(), back: vi.fn(), log: vi.fn(), skip: vi.fn(), retry: vi.fn() }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: mocks.push, back: mocks.back }) }))
vi.mock('@/hooks/use-habit-queries', () => ({ useSearchHabits: (filters: HabitsFilter) => mocks.query(filters) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { timeZone: 'UTC' } }) }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: mocks.showError }) }))
vi.mock('@/hooks/use-habit-logging', () => ({ useLogHabit: () => ({ mutate: mocks.log, isPending: false }), useSkipHabit: () => ({ mutate: mocks.skip, isPending: false }) }))
vi.mock('@/lib/motion', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/motion')>(), usePrefersReducedMotion: () => true }))

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')
type Tree = import('react-test-renderer').ReactTestRenderer
type Node = import('react-test-renderer').ReactTestInstance
let tree: Tree

function result(habits: NormalizedHabit[], { pending = false, error = false, totalPages = 1 } = {}) {
  return {
    data: { topLevelHabits: habits, habitsById: new Map(habits.map((habit) => [habit.id, habit])), childrenByParent: new Map(), totalCount: habits.length, totalPages, currentPage: 1 },
    isPending: pending, isFetching: pending, isSuccess: !pending && !error, isError: error, refetch: mocks.retry,
  }
}
const habit = (id: string, title: string) => createMockHabit({ id, title, searchMatches: [{ field: 'title', value: null }] })

async function mount(locale: 'en' | 'pt-BR' = 'pt-BR') {
  await i18n.changeLanguage(locale)
  await TestRenderer.act(() => { tree = TestRenderer.create(<I18nextProvider i18n={i18n}><SearchScreen /></I18nextProvider>) })
  return locale === 'en' ? en : ptBR
}
const hosts = (predicate: (node: Node) => boolean) => tree.root.findAll((node) => typeof node.type === 'string' && predicate(node))
const byTestId = (testID: string) => hosts((node) => node.props.testID === testID)
const isText = (node: Node) => String(node.type) === 'Text'
const texts = () => hosts(isText).map((node) => renderedText(node.props.children))
const mascots = () => byTestId('orbit-mascot')
const input = () => hosts((node) => String(node.type) === 'TextInput')[0]!
const headers = () => hosts((node) => isText(node) && node.props.accessibilityRole === 'header').map((node) => renderedText(node.props.children))
function control(label: string) {
  const found = tree.root.findAll((node) => String(node.type) === 'Pressable' && (node.props.accessibilityLabel === label || node.findAll((child) => String(child.type) === 'Text' && child.props.children === label).length > 0))[0]
  if (!found) throw new Error(`Missing control: ${label}`)
  return found
}
async function press(label: string) {
  await TestRenderer.act(() => { (control(label).props.onPress as () => void)() })
}
async function type(query: string) {
  await TestRenderer.act(() => { (input().props.onChangeText as (value: string) => void)(query) })
  await TestRenderer.act(() => { vi.advanceTimersByTime(300) })
}
async function focusField(focused = true) {
  const field = hosts((node) => typeof node.props.onFocus === 'function' && typeof node.props.onBlur === 'function' && String(node.type) === 'View')[0]!
  await TestRenderer.act(() => { ((focused ? field.props.onFocus : field.props.onBlur) as () => void)() })
}
const orbitOffset = () => StyleSheet.flatten(byTestId('search-orbit')[0]!.props.style as ViewStyle).marginTop
/** Hands the scroller, Orbit and the question a height, as the native layout pass does. */
async function layout() {
  await TestRenderer.act(() => {
    for (const [testID, height] of [['search-scroller', 800], ['search-orbit', 120], ['search-question', 100]] as const) {
      (byTestId(testID)[0]!.props.onLayout as (event: { nativeEvent: { layout: { x: number; y: number; width: number; height: number } } }) => void)({ nativeEvent: { layout: { x: 0, y: 0, width: 412, height } } })
    }
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  reanimatedTestState.reducedMotion = false
  mocks.query.mockReturnValue(result([]))
})
afterEach(async () => {
  await TestRenderer.act(() => { tree.unmount() })
  reanimatedTestState.reducedMotion = false
  vi.useRealTimers()
})

describe('the Android search screen with the guided flows off', () => {
  it.each(['en', 'pt-BR'] as const)('renders the current surface in %s: the title is the one heading above the command rows and no Orbit shows', async (locale) => {
    mocks.query.mockReturnValue(result([habit('walk', 'Walk')]))
    const messages = await mount(locale)
    expect(mascots()).toHaveLength(0)
    expect(byTestId('search-scroller')).toHaveLength(0)
    expect(headers()).toContain(messages.habits.search.title)
    expect(headers()).not.toContain(messages.habits.search.question)
    await type('walk')
    expect(texts()).toContain(locale === 'en' ? '1 habit' : '1 hábito')
    expect(byTestId('search-orbit-line')).toHaveLength(0)
  })
})

describe('the Android search screen on the Orbit logic', () => {
  beforeEach(() => enableTestFlags('orbit_guided_flows'))

  it.each(['en', 'pt-BR'] as const)('shows one group before a query in %s: Orbit in Parado at 96, the question as the heading and the field it names', async (locale) => {
    const messages = await mount(locale)
    expect(mascots()).toHaveLength(1)
    expect(mascots()[0]!.props['data-orbit-state']).toBe('parado')
    expect(mascots()[0]!.props.width).toBe(96)
    expect(byTestId('search-orbit')[0]!.findAll((node) => node.props.testID === 'orbit-mascot').length).toBeGreaterThan(0)
    expect(headers().filter((heading) => heading === messages.habits.search.question)).toHaveLength(1)
    expect(headers()).not.toContain(messages.habits.search.title)
    expect(texts()).toContain(messages.habits.search.title)
    expect(texts().filter((value) => value === messages.habits.search.question)).toHaveLength(1)
    expect(input().props.accessibilityLabel).toBe(messages.habits.search.question)
    await layout()
    expect(orbitOffset()).toBeGreaterThan(0)
    expect(byTestId('search-orbit-line')).toHaveLength(0)
  })

  it('turns Orbit to Olhando while the field has focus, and back to Parado on blur', async () => {
    await mount()
    await focusField()
    expect(mascots()[0]!.props['data-orbit-state']).toBe('olhando')
    await focusField(false)
    expect(mascots()[0]!.props['data-orbit-state']).toBe('parado')
  })

  it('aligns the block under the header and keeps Orbit in Olhando while the keyboard is open', async () => {
    await mount()
    await layout()
    const centred = orbitOffset()
    await TestRenderer.act(() => { __emitKeyboardEvent('keyboardDidShow') })
    expect(orbitOffset()).toBe(0)
    expect(mascots()[0]!.props['data-orbit-state']).toBe('olhando')
    await TestRenderer.act(() => { __emitKeyboardEvent('keyboardDidHide') })
    expect(orbitOffset()).toBe(centred)
    expect(mascots()[0]!.props['data-orbit-state']).toBe('parado')
  })

  it.each([
    { locale: 'pt-BR' as const, count: 1, line: 'Achei 1 hábito.' },
    { locale: 'pt-BR' as const, count: 3, line: 'Achei 3 hábitos.' },
    { locale: 'en' as const, count: 1, line: 'I found 1 habit.' },
    { locale: 'en' as const, count: 3, line: 'I found 3 habits.' },
  ])('states the count in the Orbit line beside Orbit at 48 in $locale for $count', async ({ locale, count, line }) => {
    mocks.query.mockReturnValue(result(Array.from({ length: count }, (_, index) => habit(`habit-${index}`, `Walk ${index}`))))
    await mount(locale)
    await focusField()
    await type('walk')
    const row = byTestId('search-orbit-line')[0]!
    expect(renderedText(row.findAll((node) => node.props.testID === 'search-line-count')[0]!.props.children)).toBe(line)
    expect(mascots()).toHaveLength(1)
    expect(mascots()[0]!.props.width).toBe(48)
    expect(mascots()[0]!.props['data-orbit-state']).toBe('olhando')
    expect(row.findAll((node) => node.props.testID === 'orbit-mascot').length).toBeGreaterThan(0)
    expect(texts()).not.toContain(locale === 'en' ? `${count} habits` : `${count} hábitos`)
    expect(orbitOffset()).toBe(0)
    expect(hosts((node) => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith(locale === 'en' ? 'Open Walk' : 'Abrir Walk'))).toHaveLength(count)
  })

  it('keeps the field mounted with its text when the first letter moves Orbit from the block to the line', async () => {
    mocks.query.mockReturnValue(result([habit('walk', 'Walk')]))
    await mount()
    const before = input()
    await type('w')
    expect(input()).toBe(before)
    expect(input().props.value).toBe('w')
    expect(byTestId('search-scroller')[0]!.props.stickyHeaderIndices).toEqual([1])
  })

  it('changes the Orbit line with the result set and sends no request other than the search', async () => {
    mocks.query.mockReturnValue(result([habit('walk', 'Walk'), habit('run', 'Run')]))
    await mount()
    await type('a')
    expect(texts()).toContain('Achei 2 hábitos.')
    mocks.query.mockReturnValue(result([habit('walk', 'Walk')]))
    await type('wa')
    expect(texts()).toContain('Achei 1 hábito.')
    expect(texts()).not.toContain('Achei 2 hábitos.')
    expect(new Set(mocks.query.mock.calls.map(([filters]) => JSON.stringify(filters)))).toEqual(new Set([
      JSON.stringify({ search: '', page: 1, pageSize: 20 }),
      JSON.stringify({ search: 'a', page: 1, pageSize: 20 }),
      JSON.stringify({ search: 'wa', page: 1, pageSize: 20 }),
    ]))
  })

  it('announces a changed line in one polite live region after a one second pause', async () => {
    mocks.query.mockReturnValue(result([habit('walk', 'Walk')]))
    await mount()
    await type('walk')
    const status = () => byTestId('search-line-status')[0]!
    expect(status().props.accessibilityLiveRegion).toBe('polite')
    expect(renderedText(status().props.children)).toBe('')
    await TestRenderer.act(() => { vi.advanceTimersByTime(1000) })
    expect(renderedText(status().props.children)).toBe('Achei 1 hábito.')
  })

  it.each(['en', 'pt-BR'] as const)('names a miss in the Orbit line with Orbit in Parado in %s, and keeps the create action with its request', async (locale) => {
    const messages = await mount(locale)
    await focusField()
    await type('yoga')
    const line = byTestId('search-orbit-line')[0]!.findAll((node) => node.props.testID === 'search-line-miss' && typeof node.type === 'string')[0]!
    expect(renderedText(line).replaceAll(/\s+/g, ' ')).toBe(locale === 'en' ? 'Nothing found for “yoga”' : 'Nada encontrado para “yoga”')
    expect(texts().filter((value) => value.includes('“yoga”'))).toHaveLength(1)
    expect(mascots()[0]!.props['data-orbit-state']).toBe('parado')
    expect(texts()).toContain(messages.habits.search.emptyBody)
    await press(messages.habits.search.create)
    expect(mocks.push).toHaveBeenCalledWith('/habits/new?title=yoga&from=%2Fsearch')
  })

  it('shows the load error with its retry beside Orbit in Parado, and the retry runs the search again', async () => {
    mocks.query.mockReturnValue(result([], { error: true }))
    await mount()
    await focusField()
    await type('walk')
    const row = byTestId('search-orbit-line')[0]!
    expect(row.findAll(isText).map((node) => renderedText(node.props.children))).toContain(ptBR.habits.search.loadError)
    expect(mascots()[0]!.props['data-orbit-state']).toBe('parado')
    await press(ptBR.common.retry)
    expect(mocks.retry).toHaveBeenCalledTimes(1)
  })

  it('draws no Orbit line and no Orbit in the short wait before the searching status, so the block closes up', async () => {
    mocks.query.mockReturnValue(result([], { pending: true }))
    await mount('en')
    await TestRenderer.act(() => { (input().props.onChangeText as (value: string) => void)('walk') })
    expect(byTestId('search-orbit-line')).toHaveLength(0)
    expect(mascots()).toHaveLength(0)
    await TestRenderer.act(() => { vi.advanceTimersByTime(600) })
    expect(byTestId('search-orbit-line')).toHaveLength(1)
    expect(mascots()).toHaveLength(1)
  })

  it('keeps the searching status in the line while the search runs, with Orbit in Olhando', async () => {
    mocks.query.mockReturnValue(result([], { pending: true }))
    await mount('en')
    await focusField()
    await type('walk')
    await TestRenderer.act(() => { vi.advanceTimersByTime(300) })
    const row = byTestId('search-orbit-line')[0]!
    expect(row.findAll(isText).map((node) => renderedText(node.props.children))).toContain('Searching')
    expect(mascots()[0]!.props['data-orbit-state']).toBe('olhando')
    expect(byTestId('search-rows')[0]!.props.accessibilityState).toEqual({ busy: true })
    expect(input().props.value).toBe('walk')
  })

  it('opens the habit through the current route on a row press', async () => {
    mocks.query.mockReturnValue(result([habit('walk', 'Walk')]))
    await mount('en')
    await type('walk')
    await press('Open Walk in the name')
    expect(mocks.push).toHaveBeenCalledWith('/habits/walk')
  })

  it('keeps the previous and the next control with the page requests of the current surface', async () => {
    mocks.query.mockReturnValue(result([habit('walk', 'Walk')], { totalPages: 2 }))
    await mount('en')
    await type('walk')
    expect(() => control(en.habits.search.previous)).toThrow()
    await press(en.habits.search.next)
    expect(mocks.query).toHaveBeenLastCalledWith({ search: 'walk', page: 2, pageSize: 20 })
    expect(() => control(en.habits.search.next)).toThrow()
    await press(en.habits.search.previous)
    expect(mocks.query).toHaveBeenLastCalledWith({ search: 'walk', page: 1, pageSize: 20 })
  })

  it('keeps every command row, the log page and the skip page with their requests, and no Orbit on a command page', async () => {
    mocks.query.mockReturnValue(result([habit('walk', 'Walk')]))
    await mount('en')
    for (const label of [en.command.createHabit, en.command.logHabit, en.command.skipHabit]) expect(control(label)).toBeDefined()
    expect(headers()).toEqual(expect.arrayContaining([en.command.groups.create, en.command.groups.actions, en.command.groups.destinations, en.command.groups.search]))
    await press(en.command.logHabit)
    expect(mascots()).toHaveLength(0)
    expect(texts()).toContain(en.command.page.log)
    expect(headers()).toContain(en.habits.search.question)
    await press('Walk')
    expect(mocks.log).toHaveBeenCalledWith({ habitId: 'walk', intent: 'log' }, expect.objectContaining({ onSuccess: expect.any(Function) }))
    await press(en.common.back)
    expect(mocks.back).not.toHaveBeenCalled()
    expect(mascots()).toHaveLength(1)
    await press(en.command.skipHabit)
    await press('Walk')
    expect(mocks.skip).toHaveBeenCalledWith({ habitId: 'walk' }, expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }))
    const { onError } = mocks.skip.mock.calls[0]![1] as { onError: () => void }
    await TestRenderer.act(() => { onError() })
    expect(mocks.showError).toHaveBeenCalledWith(en.errors.updateHabit)
    await press(en.common.back)
    await press(en.common.back)
    expect(mocks.back).toHaveBeenCalledTimes(1)
    await press(en.command.createHabit)
    expect(mocks.push).toHaveBeenLastCalledWith('/habits/new?from=%2Fsearch')
  })

  it('gives every row, the field and the header control a target of at least 48', async () => {
    mocks.query.mockReturnValue(result([habit('walk', 'Walk')]))
    await mount('en')
    await type('a')
    for (const label of ['Open Walk in the name', en.command.createHabit]) {
      const style = control(label).props.style as PressableProps['style']
      const flat = StyleSheet.flatten<ViewStyle>(typeof style === 'function' ? style({ pressed: false }) : style)
      expect(flat.minHeight).toBeGreaterThanOrEqual(48)
    }
    expect((StyleSheet.flatten(input().props.style) as { minHeight?: number }).minHeight).toBeGreaterThanOrEqual(48)
  })

  it('starts no entrance animation on the rows for a keystroke', async () => {
    mocks.query.mockReturnValue(result([habit('walk', 'Walk')]))
    await mount('en')
    await type('w')
    await type('wa')
    const rows = byTestId('search-rows')[0]!
    expect(rows.findAll((node) => typeof node.type === 'string' && (node.props.entering !== undefined || node.props.layout !== undefined || node.type.startsWith('Animated'))).filter((node) => node.findAll((child) => child.props.testID === 'orbit-mascot').length === 0)).toHaveLength(0)
  })

  it('keeps Orbit still under reduced motion and still swaps the face to Olhando', async () => {
    reanimatedTestState.reducedMotion = true
    await mount()
    expect(mascots()[0]!.props['data-orbit-loop']).toBe('still')
    await focusField()
    expect(mascots()[0]!.props['data-orbit-state']).toBe('olhando')
    expect(mascots()[0]!.props['data-orbit-loop']).toBe('still')
  })

  it('finds no result dialog on the search screen', async () => {
    mocks.query.mockReturnValue(result([habit('walk', 'Walk')]))
    await mount()
    await type('walk')
    expect(texts()).not.toContain(ptBR.result.title)
    expect(byTestId('result-dialog')).toHaveLength(0)
  })
})
