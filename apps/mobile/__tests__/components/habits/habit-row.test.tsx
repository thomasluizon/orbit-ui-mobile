import { afterEach, describe, it, expect, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { HabitRow } from '@/components/habits/habit-row'
import { StyleSheet } from 'react-native'
import {
  __resetTestHostConfig,
  __setHostRefsNull,
  __setMeasureInWindowImpl,
} from '@/test-mocks/react-native'

const TestRenderer = require('react-test-renderer')

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))

vi.mock('@/hooks/use-time-format', () => ({
  useTimeFormat: () => ({ displayTime: (value: string) => value }),
}))

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))

vi.mock('@/lib/motion', () => ({
  usePrefersReducedMotion: () => true,
  useResolvedMotionPreset: () => ({
    enterDuration: 0,
    exitDuration: 0,
    scaleFrom: 0.96,
    scaleTo: 1,
    shift: 8,
  }),
  toAnimatedEasing: (value: unknown) => value,
}))

function collectStrings(node: unknown): string[] {
  if (node == null) return []
  if (typeof node === 'string') return [node]
  if (Array.isArray(node)) return node.flatMap(collectStrings)
  return collectStrings((node as { children?: unknown }).children)
}

function renderRowText(habit: ReturnType<typeof createMockHabit>): string[] {
  let tree: { toJSON: () => unknown }
  TestRenderer.act(() => {
    tree = TestRenderer.create(<HabitRow habit={habit} />)
  })
  return collectStrings(tree!.toJSON())
}

describe('HabitRow canonical content (mobile)', () => {
  it('omits descriptions and tags from the canonical row', () => {
    const texts = renderRowText(
      createMockHabit({
        title: 'Read',
        description: 'A long preview',
        tags: [
          { id: '1', name: 'Learning', color: '#7c3aed' },
          { id: '2', name: 'Evening', color: '#10b981' },
        ],
      }),
    )

    expect(texts).toContain('Read')
    expect(texts).not.toContain('A long preview')
    expect(texts).not.toContain('Learning')
    expect(texts).not.toContain('Evening')
  })

  it('uses the first uppercase letter when an emoji is missing', () => {
    const texts = renderRowText(
      createMockHabit({
        title: 'read',
        emoji: null,
      }),
    )

    expect(texts).toContain('R')
  })
})

describe('HabitRow status control names (mobile)', () => {
  it('presses the whole card from the body and only the ring from the ring control', () => {
    let renderer: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      renderer = TestRenderer.create(
        <HabitRow
          habit={createMockHabit({ title: 'Meditate' })}
          hasChildren
          childrenDone={0}
          childrenTotal={1}
          actions={{ onLog: vi.fn() }}
        />,
      )
    })

    const body = renderer!.root.findAll(
      (node: { props: Record<string, unknown> }) => node.props.delayLongPress === 500,
    )[0]
    const ring = renderer!.root.findAll(
      (node: { props: Record<string, unknown> }) =>
        node.props.accessibilityLabel === 'habits.statusDot.empty, habits.logHabit: Meditate, 0/1' &&
        typeof node.props.style === 'function',
    )[0]

    TestRenderer.act(() => body.props.onPressIn())
    const pressedCard = StyleSheet.flatten(
      renderer!.root.findByProps({ testID: 'habit-row' }).props.style,
    ) as Record<string, unknown>
    const restingRing = StyleSheet.flatten(ring.props.style({ pressed: false })) as Record<string, unknown>
    expect(pressedCard.backgroundColor).toBe('rgba(250,250,250,0.14)')
    expect(pressedCard.borderColor).toBe('rgba(255,255,255,0.16)')
    expect(restingRing.backgroundColor).toBeUndefined()

    TestRenderer.act(() => body.props.onPressOut())
    const restingCard = StyleSheet.flatten(
      renderer!.root.findByProps({ testID: 'habit-row' }).props.style,
    ) as Record<string, unknown>
    const pressedRing = StyleSheet.flatten(ring.props.style({ pressed: true })) as Record<string, unknown>
    expect(restingCard.backgroundColor).toBe('rgba(250,250,250,0.04)')
    expect(pressedRing.backgroundColor).toBe('rgba(250,250,250,0.14)')
  })

  it('makes every read-only descendant disabled and guards its actions', () => {
    const onDetail = vi.fn()
    const onLog = vi.fn()
    const onToggleExpand = vi.fn()
    const onEdit = vi.fn()
    let renderer: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      renderer = TestRenderer.create(
        <HabitRow
          habit={createMockHabit({ title: 'Meditate' })}
          readOnly
          hasChildren
          childrenDone={0}
          childrenTotal={1}
          actions={{ onDetail, onLog, onToggleExpand, onEdit }}
        />,
      )
    })

    const row = renderer!.root.findByProps({ testID: 'habit-row' })
    expect(row.props.pointerEvents).toBeUndefined()
    expect(row.props.accessibilityState).toEqual({ disabled: true })

    const controls = [
      renderer!.root.findByProps({ accessibilityLabel: 'common.expand' }),
      renderer!.root.findByProps({ accessibilityLabel: 'habits.statusDot.empty, habits.logHabit: Meditate, 0/1' }),
      renderer!.root.findByProps({ accessibilityLabel: 'habits.actions.more' }),
    ]
    const body = renderer!.root.findAll(
      (node: { props: Record<string, unknown> }) => node.props.delayLongPress === 500,
    )[0]
    expect(body?.props.disabled).toBe(true)
    for (const control of controls) {
      expect(control.props.disabled).toBe(true)
      TestRenderer.act(() => control.props.onPress?.())
    }
    TestRenderer.act(() => {
      body?.props.onPress?.()
      body?.props.onLongPress?.()
    })

    expect(onDetail).not.toHaveBeenCalled()
    expect(onLog).not.toHaveBeenCalled()
    expect(onToggleExpand).not.toHaveBeenCalled()
    expect(onEdit).not.toHaveBeenCalled()
  })

  it('uses a 500 ms still hold for selection', () => {
    let renderer: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      renderer = TestRenderer.create(
        <HabitRow
          habit={createMockHabit({ title: 'Meditate' })}
          actions={{ onLongPressCard: vi.fn() }}
        />,
      )
    })

    const body = renderer!.root.findAll(
      (node: { props: Record<string, unknown> }) => node.props.delayLongPress === 500,
    )[0]
    expect(body).toBeDefined()
  })

  it('announces the habit name with the state and log action', () => {
    let renderer: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      renderer = TestRenderer.create(
        <HabitRow habit={createMockHabit({ title: 'Meditate' })} />,
      )
    })

    expect(
      renderer!.root.findByProps({
        accessibilityLabel: 'habits.statusDot.empty, habits.logHabit: Meditate',
      }),
    ).toBeDefined()
  })

  it('announces parent progress and the parent action', () => {
    let renderer: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      renderer = TestRenderer.create(
        <HabitRow
          habit={createMockHabit({ title: 'Morning routine' })}
          hasChildren
          childrenDone={1}
          childrenTotal={2}
        />,
      )
    })

    expect(
      renderer!.root.findByProps({
        accessibilityLabel:
          'habits.statusDot.empty, habits.logHabit: Morning routine, 1/2',
      }),
    ).toBeDefined()
  })

  it('logs a parent with open children directly from its ring', () => {
    const onLog = vi.fn()
    let renderer: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      renderer = TestRenderer.create(
        <HabitRow
          habit={createMockHabit({ title: 'Morning routine' })}
          hasChildren
          childrenDone={1}
          childrenTotal={2}
          actions={{ onLog }}
        />,
      )
    })

    const ring = renderer!.root.findByProps({
      accessibilityLabel: 'habits.statusDot.empty, habits.logHabit: Morning routine, 1/2',
    })
    TestRenderer.act(() => ring.props.onPress())
    expect(onLog).toHaveBeenCalledOnce()
  })
})

function renderRowWithMenu() {
  let renderer: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => {
    renderer = TestRenderer.create(
      <HabitRow
        habit={createMockHabit({ title: 'Read' })}
        actions={{ onEdit: vi.fn() }}
      />,
    )
  })
  return renderer!
}

function pressMoreButton(renderer: ReturnType<typeof TestRenderer.create>) {
  const moreButton = renderer.root.findAll(
    (node: { props: Record<string, unknown> }) =>
      node.props.accessibilityLabel === 'habits.actions.more',
  )[0]
  TestRenderer.act(() => {
    ;(moreButton.props.onPress as () => void)()
  })
}

describe('HabitRow menu (mobile)', () => {
  afterEach(() => {
    __resetTestHostConfig()
  })

  it('opens the menu even when measureInWindow never invokes its callback', () => {
    __setMeasureInWindowImpl(() => {})
    const renderer = renderRowWithMenu()

    pressMoreButton(renderer)

    expect(collectStrings(renderer.toJSON())).toContain('common.edit')
  })

  it('opens the menu even when the anchor ref is null', () => {
    __setHostRefsNull(true)
    const renderer = renderRowWithMenu()

    pressMoreButton(renderer)

    expect(collectStrings(renderer.toJSON())).toContain('common.edit')
  })
})
