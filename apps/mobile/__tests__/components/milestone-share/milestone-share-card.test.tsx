import React from 'react'
import { StyleSheet, type ViewStyle } from 'react-native'
import type { ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { SPACING } from '@orbit/shared/theme'
import { MilestoneShareCard, type MilestoneShareVariant } from '@/components/milestone-share/milestone-share-card'
import { createTokensV2 } from '@/lib/theme'
import { measureProfileRow } from '@/__tests__/support/profile-row-geometry'

const TestRenderer = require('react-test-renderer') as typeof import('react-test-renderer')

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('react-native-qrcode-svg', () => ({
  default: ({ size }: { size: number }) => React.createElement('View', { testID: 'milestone-share-qr', style: { width: size, height: size } }),
}))

type RenderedTree = ReactTestRenderer & { toJSON: () => Parameters<typeof measureProfileRow>[0] }
type RenderedNode = {
  type: unknown
  props: Record<string, unknown>
  children: (RenderedNode | string)[]
  findAll: (predicate: (node: RenderedNode) => boolean) => RenderedNode[]
}

const tokens = createTokensV2('purple', 'dark')
const streak: MilestoneShareVariant = { kind: 'streak', streak: 30 }
const achievement: MilestoneShareVariant = { kind: 'achievement', achievementId: 'first_orbit', iconKey: 'rocket', rarity: 'rare' }

function renderCard(variant: MilestoneShareVariant, referralUrl: string) {
  let tree: RenderedTree | undefined
  void TestRenderer.act(() => {
    tree = TestRenderer.create(<MilestoneShareCard variant={variant} referralUrl={referralUrl} />) as RenderedTree
  })
  return tree!
}

function hostByTestID(tree: RenderedTree, testID: string): RenderedNode {
  return (tree.root as unknown as RenderedNode).findAll((node) => typeof node.type === 'string' && node.props.testID === testID)[0]!
}

describe('MilestoneShareCard (mobile)', () => {
  it.each([
    { name: 'the streak card with the referral footer', variant: streak, referralUrl: 'https://useorbit.org/r/ABC123' },
    { name: 'the achievement card with the referral footer', variant: achievement, referralUrl: 'https://useorbit.org/r/ABC123' },
    { name: 'the plain streak card', variant: streak, referralUrl: '' },
  ])('draws the hairline of $name on a last overlay child that takes no layout space', ({ variant, referralUrl }) => {
    const tree = renderCard(variant, referralUrl)
    const card = hostByTestID(tree, 'milestone-share-card')
    const cardStyle = StyleSheet.flatten<ViewStyle>(card.props.style as ViewStyle)
    expect(cardStyle.borderWidth, 'the card hairline takes no layout space').toBeUndefined()
    expect(cardStyle.borderColor).toBeUndefined()
    expect(cardStyle.outlineWidth, 'the card does not draw the hairline beneath its flush band').toBeUndefined()

    const lastChild = card.children.at(-1)
    const ring = typeof lastChild === 'string' ? undefined : lastChild?.findAll((node) => typeof node.type === 'string')[0]
    expect(ring?.props.testID, 'the hairline is the last child, so it paints above the band and the footer').toBe('milestone-share-card-ring')
    expect(ring?.props.pointerEvents).toBe('none')
    expect(StyleSheet.flatten<ViewStyle>(ring?.props.style as ViewStyle)).toMatchObject({
      position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
      borderRadius: cardStyle.borderRadius, outlineWidth: 1, outlineOffset: -1, outlineStyle: 'solid', outlineColor: tokens.hairline,
    })
  })

  it.each([
    { name: 'streak', variant: streak },
    { name: 'achievement', variant: achievement },
  ])('starts the $name band and its copy at the card edge', ({ variant }) => {
    const tree = renderCard(variant, 'https://useorbit.org/r/ABC123')
    const measured = measureProfileRow(tree.toJSON(), 360, 1)
    const box = (testID: string) => measured.boxes.find((candidate) => candidate.testID === testID)!
    const card = box('milestone-share-card')
    const band = box('milestone-share-band')
    expect(card).toMatchObject({ left: 0, top: 0, width: 360 })
    expect(band).toMatchObject({ left: 0, top: 0, width: 360 })
    expect(box('milestone-share-card-ring')).toMatchObject({ left: 0, top: 0, right: card.right, bottom: card.bottom })
    const eyebrow = measured.texts.find((text) => text.label === `milestoneShare.${variant.kind}Eyebrow`)!
    expect(eyebrow.left).toBe(SPACING.s24)
    const footer = box('milestone-share-footer')
    expect(footer).toMatchObject({ left: 0, width: 360, top: band.bottom })
    expect(footer.bottom).toBeCloseTo(card.bottom, 3)
    expect(box('milestone-share-qr').left).toBe(SPACING.s16 + SPACING.s4)
  })
})
