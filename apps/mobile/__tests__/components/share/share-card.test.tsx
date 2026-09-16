import { StyleSheet } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import type { Recap } from '@orbit/shared/types/gamification'
import {
  createMockRecap,
  createMockRetrospectiveMetrics,
} from '@orbit/shared/__tests__/factories'
import { ShareCard } from '@/components/share/share-card'

const TestRenderer = require('react-test-renderer')

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (key === 'shareCard.weeklyBarLabel') return String(params?.day)
      return params ? `${key}:${JSON.stringify(params)}` : key
    },
  }),
}))

function collectText(node: unknown): string {
  if (node == null) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(collectText).join(' ')
  if (typeof node === 'object' && 'children' in (node as Record<string, unknown>)) {
    return collectText((node as { children: unknown }).children)
  }
  return ''
}

function render(props: { recap: Recap }) {
  let tree: {
    toJSON: () => unknown
    root: {
      findAll: (
        predicate: (node: { type?: unknown; props?: Record<string, unknown> }) => boolean,
      ) => unknown[]
    }
  }
  TestRenderer.act(() => {
    tree = TestRenderer.create(<ShareCard {...props} />)
  })
  return tree!
}

describe('ShareCard (mobile)', () => {
  it('renders the branded capture target at the 9 by 16 story ratio', () => {
    const tree = render({ recap: createMockRecap() })
    const card = tree.root.findAll((node) => node.props?.testID === 'share-card')[0] as {
      props: { style: unknown }
    }
    const marks = tree.root.findAll((node) => node.props?.testID === 'orbit-mark-accent')
    expect(StyleSheet.flatten(card.props.style)).toMatchObject({ width: 360, height: 640 })
    expect(marks.length).toBeGreaterThan(0)
  })

  it('contains no controls and exactly one primary figure with two supporting figures', () => {
    const tree = render({ recap: createMockRecap() })
    const controls = tree.root.findAll((node) => node.props?.accessibilityRole === 'button')
    const figures = tree.root.findAll(
      (node) => typeof node.type === 'string' && node.props?.testID === 'share-card-figure',
    )

    expect(controls).toHaveLength(0)
    expect(figures).toHaveLength(3)
  })

  it('prints the same three-letter weekday form as the weekday page', () => {
    const recap = createMockRecap({
      metrics: {
        ...createMockRecap().metrics,
        weeklyConsistency: [91, 20, 30, 40, 50, 60, 70],
      },
    })
    const tree = render({ recap })
    const weekday = tree.root.findAll(
      (node) => typeof node.type === 'string' && node.props?.testID === 'share-card-weekday',
    )[0]

    expect(collectText(weekday)).toContain('dates.daysShort.monday')
  })

  it('renders closed goals for a goal-only recap', () => {
    const text = collectText(
      render({
        recap: createMockRecap({
          goalCompletions: 3,
          shareDeepLink: '',
          metrics: createMockRetrospectiveMetrics({
            completionRate: 0,
            totalCompletions: 0,
            bestStreak: 0,
            currentStreak: 0,
            activeDays: 0,
            topHabits: [],
            weeklyConsistency: [0, 0, 0, 0, 0, 0, 0],
          }),
        }),
      }).toJSON(),
    )

    expect(text).toContain('3 shareCard.stats.goalsClosed')
  })
})
