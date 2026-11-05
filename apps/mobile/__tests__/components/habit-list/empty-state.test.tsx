import { ORBIT_MARK_PATHS } from '@orbit/shared/contracts/brand'
import React from 'react'
import { StyleSheet, type StyleProp, type TextStyle } from 'react-native'
import { type GeometryHost } from '@/__tests__/support/safe-area-geometry'
import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { expectPressFill } from '@/__tests__/support/press-feedback'
import { measureProfileRow } from '@/__tests__/support/profile-row-geometry'
import { OrbitMark } from '@/components/ui/orbit-mark'
import { createTokensV2 } from '@/lib/theme'
import {
  HabitListEmptyState,
  HabitListAllDone,
} from '@/components/habit-list/empty-state'

const translations = vi.hoisted<{ labels: Record<string, string> }>(() => ({ labels: {} }))
afterEach(() => { translations.labels = {} })

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => translations.labels[key] ?? key,
    i18n: { language: 'en' },
  }),
}))

interface TestNode {
  type: unknown
  props: Record<string, unknown>
  findAll(predicate: (node: TestNode) => boolean): TestNode[]
  findAllByType(type: unknown): TestNode[]
}
interface TestTree {
  root: TestNode
  toJSON(): unknown
}
interface TestRendererApi {
  create(element: React.ReactNode): TestTree
  act(callback: () => void): void
}
const TestRenderer: TestRendererApi = require('react-test-renderer')

function render(element: React.ReactNode): TestTree {
  let tree!: TestTree
  TestRenderer.act(() => {
    tree = TestRenderer.create(element)
  })
  return tree
}

function textStrings(tree: TestTree): string[] {
  return tree.root
    .findAllByType('Text')
    .flatMap((node) => {
      const children = node.props.children
      return Array.isArray(children) ? children : [children]
    })
    .filter((value): value is string => typeof value === 'string')
}

function pressableWithLabel(tree: TestTree, label: string): TestNode | undefined {
  return tree.root.findAll(
    (node) =>
      node.props.accessibilityRole === 'button' &&
      (node.props.accessibilityLabel === label || node.findAllByType('Text').some(child => (child.props.label ?? child.props.accessibilityLabel ?? child.props.children) === label)),
  )[0]
}

describe('HabitListEmptyState', () => {
  it.each([320, 360, 384, 412, 740, 1440])('centres the normal Orbit logo, copy and action at %s', (width) => {
    const tree = render(<HabitListAllDone onSeeUpcoming={vi.fn()} />)
    const finish = tree.root.findAll(node => node.props.testID === 'habit-list-all-done')[0]!
    expect(StyleSheet.flatten(finish.props.style as StyleProp<TextStyle>).alignItems).toBe('center')
    const mark = tree.root.findAllByType(OrbitMark)[0]
    expect(mark).toBeDefined()
    expect(tree.root.findAllByType('Path').map(path => path.props.d)).toEqual(ORBIT_MARK_PATHS.map(path => path.d))
    expect(tree.root.findAllByType('Circle')).toHaveLength(0)
    expect(mark!.props).toMatchObject({ size: 48, accent: false })
    const ring = tree.root.findAll(node => node.props.testID === 'completed-day-mark')[0]!
    expect(StyleSheet.flatten(ring.props.style as StyleProp<TextStyle>)).toMatchObject({ width: 48, height: 48 })
    for (const words of [en, ptBR]) {
      const labels = [words.habits.allDoneToday, words.habits.allDoneHint, words.habits.seeUpcoming]
      translations.labels = {
        'habits.allDoneToday': words.habits.allDoneToday,
        'habits.allDoneHint': words.habits.allDoneHint,
        'habits.seeUpcoming': words.habits.seeUpcoming,
      }
      const localized = render(<HabitListAllDone onSeeUpcoming={vi.fn()} />)
      const host = localized.toJSON() as GeometryHost
      const measured = measureProfileRow(host, Math.min(width - 32, 708), 1)
      const identity = measured.boxes.find(box => box.testID === 'completed-day-mark')!
      expect(identity.width).toBe(48)
      expect(identity.left + identity.width / 2).toBeCloseTo(Math.min(width - 32, 708) / 2)
      expect(measured.texts[0]!.top - identity.bottom).toBeCloseTo(24)
      for (const label of labels) {
        const text = measured.texts.find(text => text.label === label)!
        expect(text.lines).toBe(1)
        expect(text.clipped).toBe(false)
        expect(text.left).toBeGreaterThanOrEqual(24)
        expect(text.right).toBeLessThanOrEqual(Math.min(width - 32, 708) - 24)
      }
    }
    expect(tree.root.findAllByType('AnimatedView')).toHaveLength(0)
  })
  it('keeps completion text paired and separates the upcoming action', () => {
    const onSeeUpcoming = vi.fn()
    const tree = render(<HabitListAllDone onSeeUpcoming={onSeeUpcoming} />)
    const geometry = measureProfileRow(tree.toJSON() as GeometryHost, 380, 1)
    const title = geometry.texts.find(text => text.label === 'habits.allDoneToday')!
    const hint = geometry.texts.find(text => text.label === 'habits.allDoneHint')!
    expect(hint.top - title.bottom).toBeCloseTo(8)
    expect(geometry.controls[0]!.top - hint.bottom).toBeCloseTo(24)
    TestRenderer.act(() => { (pressableWithLabel(tree, 'habits.seeUpcoming')!.props.onPress as () => void)() })
    expect(onSeeUpcoming).toHaveBeenCalledOnce()
  })
  it.each([en, ptBR])('uses the shared empty-state mark and title sizes without clipping large text', (words) => {
    const title = words.habits.emptyState
    const tree = render(<HabitListEmptyState title={title} description="" />)
    const label = tree.root.findAllByType('Text').find((node) => node.props.children === title)!
    const style = StyleSheet.flatten(label.props.style as StyleProp<TextStyle>)
    expect.soft(style.fontSize).toBe(20)
    expect(style.fontFamily).toBe('Geist_500Medium')
    expect(label.props.numberOfLines).toBeUndefined()
    expect(label.props.ellipsizeMode).toBeUndefined()
    expect(label.props.allowFontScaling).not.toBe(false)
    expect.soft(tree.root.findAllByType(OrbitMark)[0]!.props.size).toBe(96)
  })

  it('renders the title and a distinct description', () => {
    const tree = render(
      <HabitListEmptyState title="No habits yet" description="Add one to begin" />,
    )
    const texts = textStrings(tree)
    expect(texts).toContain('No habits yet')
    expect(texts).toContain('Add one to begin')
  })

  it('omits the description when it duplicates the title', () => {
    const tree = render(
      <HabitListEmptyState title="Same" description="Same" />,
    )
    expect(textStrings(tree).filter((value) => value === 'Same')).toHaveLength(1)
  })

  it('stacks the Astra pill and the ghost create pill in the primary variant', () => {
    const onAskAstra = vi.fn()
    const onAction = vi.fn()
    const tree = render(
      <HabitListEmptyState
        title="Empty"
        description=""
        askAstraLabel="Ask Astra"
        onAskAstra={onAskAstra}
        actionLabel="Create habit"
        onAction={onAction}
      />,
    )
    const texts = textStrings(tree)
    expect(texts).toContain('Ask Astra')
    expect(pressableWithLabel(tree, 'Ask Astra')).toBeTruthy()
    expect(texts).toContain('Create habit')
  })

  it('renders the create pill without the Astra pill when no Astra handler is given', () => {
    const tree = render(
      <HabitListEmptyState title="Empty" description="" actionLabel="Create habit" />,
    )
    const texts = textStrings(tree)
    expect(texts).toContain('Create habit')
    expect(texts).not.toContain('Ask Astra')
  })

  it('falls back to a single underline link action in the secondary variant', () => {
    const onAction = vi.fn()
    const tree = render(
      <HabitListEmptyState
        variant="secondary"
        title="Empty"
        description=""
        actionLabel="Browse all"
        onAction={onAction}
        askAstraLabel="Ask Astra"
        onAskAstra={vi.fn()}
      />,
    )
    expect(textStrings(tree)).not.toContain('Ask Astra')
    const link = pressableWithLabel(tree, 'Browse all')
    expect(link).toBeTruthy()
    expectPressFill(tree, 'Browse all', createTokensV2('purple', 'dark').bgHover, 999)
    TestRenderer.act(() => {
      ;(link!.props as { onPress: () => void }).onPress()
    })
    expect(onAction).toHaveBeenCalledTimes(1)
  })

  it('renders nothing actionable when no labels are provided', () => {
    const tree = render(<HabitListEmptyState title="Empty" description="" />)
    expect(
      tree.root.findAll((node) => node.props.accessibilityRole === 'button'),
    ).toHaveLength(0)
  })
})
