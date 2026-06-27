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

describe('HabitRow tags (mobile)', () => {
  it('renders the habit tag names on the row', () => {
    const texts = renderRowText(
      createMockHabit({
        title: 'Read',
        tags: [
          { id: '1', name: 'Learning', color: '#7c3aed' },
          { id: '2', name: 'Evening', color: '#10b981' },
        ],
      }),
    )

    expect(texts).toContain('Learning')
    expect(texts).toContain('Evening')
  })

  it('caps visible tags at three and shows a +N overflow counter', () => {
    const texts = renderRowText(
      createMockHabit({
        title: 'Read',
        tags: Array.from({ length: 10 }, (_, i) => ({
          id: String(i),
          name: `Tag${i}`,
          color: '#7c3aed',
        })),
      }),
    )

    expect(texts).toContain('Tag0')
    expect(texts).toContain('Tag2')
    expect(texts).not.toContain('Tag3')
    expect(texts.join('')).toContain('+7')
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
