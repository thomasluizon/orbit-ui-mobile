import { afterEach, describe, expect, it, vi } from 'vitest'
import { StyleSheet } from 'react-native'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { HabitRow } from '@/components/habits/habit-row'
import { __resetTestHostConfig, __setWindowDimensions } from '@/test-mocks/react-native'

const TestRenderer = require('react-test-renderer')
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }) }))
vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayTime: (value: string) => value }) }))
vi.mock('@/lib/motion', () => ({ usePrefersReducedMotion: () => true }))
afterEach(__resetTestHostConfig)

const descriptions = [
  ['Read two pages before breakfast.', 'Read two pages before breakfast.'],
  ['Leia duas páginas antes do café.', 'Leia duas páginas antes do café.'],
  ['## Read\n- **two** pages\n> `daily`', 'Read two pages daily'],
  ['[Guide](https://example.invalid/guide) ![Pages](https://example.invalid/image.png)', 'Guide Pages'],
  ['https://example.invalid/guide <img src="https://example.invalid/image.png">', 'https://example.invalid/guide <img src="https://example.invalid/image.png">'],
  ['**unfinished [ 📚 ' + 'a'.repeat(300), '**unfinished [ 📚 ' + 'a'.repeat(300)],
]

describe('stored native habit row descriptions', () => {
  it.each(descriptions)('renders inert preview between title and metadata: %s', (description, preview) => {
    const habit = createMockHabit({ title: 'Read ten minutes', description, dueTime: '08:00' })
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitRow habit={habit} />) })
    const texts = tree!.root.findAllByType('Text')
    const line = texts.find((node: { props: { testID?: string } }) => node.props.testID === 'habit-row-description')!
    expect(line).toBeDefined()
    expect(line.props.children).toBe(preview)
    expect(line.props.accessibilityRole).toBeUndefined()
    expect(line.props.onPress).toBeUndefined()
    expect(texts.indexOf(line)).toBeGreaterThan(texts.findIndex((node: { props: { children: unknown } }) => node.props.children === habit.title))
    const type = texts.find((node: { props: { testID?: string } }) => node.props.testID === 'habit-row-type')!
    expect(type.props.children).toBe('habits.form.typeHabit')
    expect(texts.indexOf(type)).toBeGreaterThan(texts.indexOf(line))
    expect(texts.indexOf(type)).toBeLessThan(texts.findIndex((node: { props: { testID?: string } }) => node.props.testID === 'habit-row-meta'))
    expect(StyleSheet.flatten(line.props.style)).toMatchObject({ fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 21.7 })
    expect(habit.description).toBe(description)
    TestRenderer.act(() => tree.unmount())
  })

  it.each([null, '', ' \n\t ', '![](https://example.invalid/image.png)', '> ', '# ', '` `'])('omits normalized-empty content and its gap: %s', (description) => {
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitRow habit={createMockHabit({ title: 'Read', description, dueTime: '08:00' })} />) })
    expect(tree!.root.findAllByProps({ testID: 'habit-row-description' })).toHaveLength(0)
    TestRenderer.act(() => tree.unmount())
  })

  it.each([1, 2])('uses the text-scale excerpt and accessible hint at %s text', (fontScale) => {
    __setWindowDimensions({ width: 320, height: 892, scale: 1, fontScale })
    const onDetail = vi.fn(), onLog = vi.fn()
    const description = 'Read two pages before breakfast.'
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitRow habit={createMockHabit({ title: 'Read', description })} actions={{ onDetail, onLog }} />) })
    const line = tree!.root.findByProps({ testID: 'habit-row-description' })
    expect(line.props.numberOfLines).toBe(fontScale > 1.3 ? 2 : 1)
    const body = tree!.root.findAllByType('Pressable').find((node: { props: { delayLongPress?: number } }) => node.props.delayLongPress === 500)!
    expect(body.props.accessibilityHint).toContain(description)
    expect(body.props.accessibilityLabel).not.toContain(description)
    TestRenderer.act(() => body.props.onPress())
    expect(onDetail).toHaveBeenCalledOnce()
    expect(onLog).not.toHaveBeenCalled()
    TestRenderer.act(() => tree.unmount())
  })

  it.each([
    [null, false, false, 'habits.rowTypeTask'],
    ['Day', false, false, 'habits.form.typeHabit'],
    ['Week', true, false, 'habits.form.typeHabit'],
    [null, false, true, 'habits.form.typeHabit'],
  ] as const)('keeps description and complete type for cadence %s, flexible=%s, general=%s', (frequencyUnit, isFlexible, isGeneral, expectedType) => {
    const habit = createMockHabit({ title: 'Read ten minutes', description: 'Read two pages.', frequencyUnit, isFlexible, isGeneral, dueTime: '08:00' })
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitRow habit={habit} />) })
    const texts = tree!.root.findAllByType('Text')
    const type = texts.find((node: { props: { testID?: string } }) => node.props.testID === 'habit-row-type')!
    expect(type.props.children).toBe(expectedType)
    expect(type.props.numberOfLines).toBeUndefined()
    expect(texts.indexOf(type)).toBeGreaterThan(texts.findIndex((node: { props: { testID?: string } }) => node.props.testID === 'habit-row-description'))
    const body = tree!.root.findAllByType('Pressable').find((node: { props: { delayLongPress?: number } }) => node.props.delayLongPress === 500)!
    expect(body.props.accessibilityLabel).toContain(`${habit.title}, ${expectedType}`)
    expect(body.props.accessibilityHint).toContain(habit.description)
    TestRenderer.act(() => tree.unmount())
  })
})
