import { useState } from 'react'
import { StyleSheet } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { describe, expect, it, vi } from 'vitest'
import { createMockHabit, createMockHabitScheduleItem } from '@orbit/shared/__tests__/factories'
import { buildSuccessfulLogPatch } from '@orbit/shared/utils'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { HabitRow } from '@/components/habits/habit-row'

const locale = vi.hoisted((): { current: 'en' | 'pt-BR' } => ({ current: 'en' }))

function translate(key: string): string {
  const messages = locale.current === 'en' ? en : ptBR
  return key.split('.').reduce<unknown>((value, part) =>
    (value as Record<string, unknown>)[part], messages) as string
}

const TestRenderer = require('react-test-renderer')
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: translate, i18n: { language: locale.current } }),
}))
vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayTime: (value: string) => value }) }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('@/lib/motion', () => ({ usePrefersReducedMotion: () => true }))

function LoggingRow({ parent, selectMode = false, logged = 'none' }: Readonly<{ parent: boolean; selectMode?: boolean; logged?: 'none' | 'completed' | 'range' }>) {
  const initial = createMockHabit({ title: 'Coffee', isBadHabit: true, isCompleted: logged === 'completed', isLoggedInRange: logged === 'range',
    dueDate: '2026-09-12', scheduledDates: ['2026-09-12'] })
  const [habit, setHabit] = useState(initial)
  return <HabitRow habit={habit} selectedDate={new Date('2026-09-12T12:00:00')} today="2026-09-12" hasChildren={parent} isSelectMode={selectMode}
    childrenDone={parent ? 1 : 0} childrenTotal={parent ? 2 : 0}
    actions={{ onLog: () => setHabit(createMockHabit({ ...habit, ...buildSuccessfulLogPatch(createMockHabitScheduleItem()) })),
      onUnlog: () => setHabit(initial) }} />
}

describe.each(['en', 'pt-BR'] as const)('bad-habit status in %s', (language) => {
  it.each([false, true])('announces status and performs log then undo, parent=%s', (parent) => {
    locale.current = language
    const pending = language === 'en' ? 'Not done, Log Habit: Coffee' : 'Não feito, Registrar hábito: Coffee'
    const slipped = language === 'en' ? 'Slipped, Mark incomplete: Coffee' : 'Deslize, Marcar como não feito: Coffee'
    const progress = parent ? ', 1/2' : ''
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<LoggingRow parent={parent} />) })
    const button = (name: string) => tree.root.findAllByType('Pressable').find(
      (node: { props: Record<string, unknown> }) => node.props.accessibilityLabel === name + progress)
    expect(button(pending)).toBeDefined()
    expect(button(pending).props.disabled).toBe(false)
    expect(button(slipped)).toBeUndefined()
    const body = () => tree.root.findAllByType('Pressable').find(
      (node: { props: Record<string, unknown> }) => node.props.delayLongPress === 500)
    expect(body().props.accessibilityLabel).toContain(language === 'en' ? 'Not done' : 'Não feito')
    if (!parent) expect(StyleSheet.flatten(tree!.root.findByProps({ testID: 'habit-check' }).props.style).borderColor)
      .toBe(createTokensV2('orange', 'dark').statusBad)
    TestRenderer.act(() => button(pending).props.onPress())
    expect(body().props.accessibilityLabel).toContain(language === 'en' ? 'Slipped' : 'Deslize')
    TestRenderer.act(() => button(slipped).props.onPress())
    expect(button(pending)).toBeDefined()
    expect(body().props.accessibilityLabel).toContain(language === 'en' ? 'Not done' : 'Não feito')
    TestRenderer.act(() => tree.unmount())
  })

  it.each([false, true])('announces selection glyph status, parent=%s', (parent) => {
    locale.current = language
    for (const logged of ['none', 'completed', 'range'] as const) {
      const status = logged !== 'none' ? (language === 'en' ? 'Slipped' : 'Deslize') : (language === 'en' ? 'Not done' : 'Não feito')
      let tree: ReturnType<typeof TestRenderer.create>
      TestRenderer.act(() => { tree = TestRenderer.create(<LoggingRow parent={parent} selectMode logged={logged} />) })
      expect(tree!.root.findAll((node: { props: Record<string, unknown> }) =>
        node.props.accessibilityRole === 'image' && node.props.accessibilityLabel === status + (parent ? ', 1/2' : '')).length).toBeGreaterThan(0)
      TestRenderer.act(() => tree.unmount())
    }
  })
})
