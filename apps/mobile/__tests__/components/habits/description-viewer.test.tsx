import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { SPACING } from '@orbit/shared/theme'
import type { StyleProp, ViewStyle } from 'react-native'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { DescriptionViewer } from '@/components/habits/description-viewer'
import { createTokensV2 } from '@/lib/theme'
import { expectInsetHairlineRing } from '@/__tests__/support/inset-hairline-ring'
import { measureProfileRow } from '@/__tests__/support/profile-row-geometry'

type MeasuredHost = Parameters<typeof measureProfileRow>[0]

vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('@/components/habits/description-copy-button', () => ({ DescriptionCopyButton: () => null }))
vi.mock('@/components/ui/markdown', () => ({
  Markdown: () => React.createElement('View', { testID: 'description-markdown', style: { height: 20 } }),
}))
vi.mock('@/components/ui/sheet', () => ({ Sheet: ({ children }: { children: React.ReactNode }) => React.createElement('View', null, children) }))

describe('DescriptionViewer (mobile)', () => {
  it('draws the description card hairline inside its edge, so the text starts at the web padding', async () => {
    let tree!: ReactTestRenderer
    await act(() => { tree = create(<DescriptionViewer open onClose={vi.fn()} title="Title" description="Body" />) })
    const card = tree.root.findAll((node) => String(node.type) === 'View' && node.props.testID === 'description-viewer-card')[0]!
    expectInsetHairlineRing(card.props.style as StyleProp<ViewStyle>, createTokensV2('orange', 'dark').hairline)
    const measured = measureProfileRow((tree as unknown as { toJSON: () => MeasuredHost }).toJSON(), 412, 1)
    const frame = measured.boxes.find((box) => box.testID === 'description-viewer-card')!
    expect(measured.boxes.find((box) => box.testID === 'description-markdown'), 'the text sits at the 16 dp padding of the web card').toMatchObject({
      left: frame.left + SPACING.s16, top: frame.top + SPACING.s16, right: frame.right - SPACING.s16,
    })
  })
})
