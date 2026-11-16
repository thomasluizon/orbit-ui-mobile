import { describe, expect, it, vi } from 'vitest'
import { SPACING } from '@orbit/shared/theme'
import type { StyleProp, ViewStyle } from 'react-native'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { RescheduleProposal } from '@/components/habits/reschedule-proposal'
import { createTokensV2 } from '@/lib/theme'
import { expectInsetHairlineRing } from '@/__tests__/support/inset-hairline-ring'
import { measureProfileRow } from '@/__tests__/support/profile-row-geometry'

type MeasuredHost = Parameters<typeof measureProfileRow>[0]

vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))

describe('RescheduleProposal (mobile)', () => {
  it('draws the proposal card hairline inside its edge, so the schedule starts at the web padding', async () => {
    let tree!: ReactTestRenderer
    await act(() => {
      tree = create(<RescheduleProposal proposedLabel="Proposed" dateLabel="Sun, Aug 30" timeLabel={null} scheduleLabel="Every day" rationale="Rationale" disclosure="Disclosure" />)
    })
    const card = tree.root.findAll((node) => String(node.type) === 'View' && node.props.testID === 'reschedule-proposal-card')[0]!
    expectInsetHairlineRing(card.props.style as StyleProp<ViewStyle>, createTokensV2('orange', 'dark').hairlineGhost)
    const measured = measureProfileRow((tree as unknown as { toJSON: () => MeasuredHost }).toJSON(), 412, 1)
    const frame = measured.boxes.find((box) => box.testID === 'reschedule-proposal-card')!
    const schedule = measured.texts.find((text) => text.label === 'Sun, Aug 30')!
    expect(schedule, 'the schedule starts at the 24 dp padding of the web card').toMatchObject({ left: frame.left + SPACING.s24, top: frame.top + SPACING.s24 })
  })
})
