import { afterEach, describe, it, expect, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { HabitRow } from '@/components/habits/habit-row'
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
