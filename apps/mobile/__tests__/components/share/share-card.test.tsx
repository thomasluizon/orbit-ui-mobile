import { StyleSheet, type ViewStyle } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import { PADDING, SPACING } from '@orbit/shared/theme'
import type { Recap } from '@orbit/shared/types/gamification'
import {
  createMockRecap,
  createMockRetrospectiveMetrics,
} from '@orbit/shared/__tests__/factories'
import { ShareCard } from '@/components/share/share-card'
import { createTokensV2 } from '@/lib/theme'
import { measureProfileRow } from '@/__tests__/support/profile-row-geometry'

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

function render(props: { recap: Recap; variant?: 'progress' | 'wrapped' }) {
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
  it.each([
    { variant: 'wrapped' as const, inset: SPACING.s32 },
    { variant: 'progress' as const, inset: PADDING.cardInset },
  ])('draws the $variant card hairline inside its edge, so the copy starts at the web inset', ({ variant, inset }) => {
    const tree = render({ recap: createMockRecap(), variant })
    const card = tree.root.findAll((node) => typeof node.type === 'string' && node.props?.testID === 'share-card')[0] as { props: { style: unknown } }
    const cardStyle = StyleSheet.flatten(card.props.style as ViewStyle)
    expect(cardStyle.borderWidth, 'the card hairline takes no layout space').toBeUndefined()
    expect(cardStyle).toMatchObject({ outlineWidth: 1, outlineOffset: -1, outlineStyle: 'solid', outlineColor: createTokensV2('purple', 'dark').hairline })

    const measured = measureProfileRow(tree.toJSON() as Parameters<typeof measureProfileRow>[0], 360, 1)
    const box = (testID: string) => measured.boxes.find((candidate) => candidate.testID === testID)!
    const frame = box('share-card')
    expect(box('share-card-figure'), 'the primary figure spans the card padding, as on web').toMatchObject({ left: inset, right: frame.right - inset })
    expect(box('share-card-weekday'), 'the weekday line ends at the card padding, as on web').toMatchObject({ left: inset, right: frame.right - inset, bottom: frame.bottom - inset })
  })

  it('reads the shared card inset for progress sharing', () => {
    const originalInset = PADDING.cardInset
    try {
      PADDING.cardInset = SPACING.s48
      const tree = render({ recap: createMockRecap(), variant: 'progress' })
      const card = tree.root.findAll((node) => node.props?.testID === 'share-card')[0] as {
        props: { style: unknown }
      }
      expect(StyleSheet.flatten(card.props.style)).toMatchObject({ padding: PADDING.cardInset })
    } finally {
      PADDING.cardInset = originalInset
    }
  })

  it('restores active days and completion rate on the progress image', () => {
    const text = collectText(render({
      recap: createMockRecap({ metrics: createMockRetrospectiveMetrics({ activeDays: 5, completionRate: 73.5 }) }),
      variant: 'progress',
    }).toJSON())
    expect(text).toContain('shareCard.stats.activeDays')
    expect(text).toContain('shareCard.stats.completionRate')
    expect(text).toContain('74%')
  })

  it('renders the branded capture target at the 9 by 16 story ratio', () => {
    const tree = render({ recap: createMockRecap() })
    const card = tree.root.findAll((node) => node.props?.testID === 'share-card')[0] as {
      props: { style: unknown }
    }
    const marks = tree.root.findAll((node) => node.props?.testID === 'orbit-mascot')
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
