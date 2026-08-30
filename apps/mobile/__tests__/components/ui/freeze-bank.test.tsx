import { describe, expect, it } from 'vitest'
import type { ReactTestRenderer } from 'react-test-renderer'
import type { FreezeBankWords } from '@orbit/shared/contracts/display'
import { FreezeBank } from '@/components/ui/freeze-bank'

const TestRenderer = require('react-test-renderer') as typeof import('react-test-renderer')

function findByTestId(tree: ReactTestRenderer, testID: string) {
  return tree.root.findAll((node) => node.props.testID === testID) as unknown as {
    props: { onPress?: () => void }
  }[]
}

const words: FreezeBankWords = {
  active: 'Active',
  frozen: 'Frozen',
  missed: 'Missed',
  today: 'Today',
  legendLabel: 'Streak day legend',
  disclosureCollapsed: 'Show freeze details',
  disclosureExpanded: 'Hide freeze details',
  bankedLabel: 'Banked',
  usedLabel: 'Used this month',
  nextLabel: 'Next freeze',
  nextProgressLabel: 'Progress to next freeze',
  nextFreezeInDays: 'Next freeze in 3 days',
  capacityMessage: 'The bank is full',
  protectedLabel: 'Protected days',
  protectedEmpty: 'No protected days yet',
  protectedDay: 'Protected',
  protectedToday: 'Protected today',
}

describe('FreezeBank (mobile)', () => {
  it('keeps bookkeeping folded until the disclosure is pressed', () => {
    let tree: ReactTestRenderer | undefined
    void TestRenderer.act(() => {
      tree = TestRenderer.create(
        <FreezeBank
          banked={1}
          ceiling={3}
          usedThisMonth={1}
          monthlyUseCeiling={3}
          daysTowardNext={4}
          earnRateDays={7}
          tierValue="Silver"
          tierLabel="Streak tier"
          protectedDays={[]}
          words={words}
        />,
      )
    })

    expect(tree ? findByTestId(tree, 'freeze-bank-details') : []).toHaveLength(0)
    void TestRenderer.act(() => {
      const onPress = tree
        ? findByTestId(tree, 'freeze-bank-disclosure')[0]?.props.onPress
        : undefined
      if (typeof onPress === 'function') onPress()
    })
    expect(tree ? findByTestId(tree, 'freeze-bank-details').length : 0).toBeGreaterThan(0)
    expect(
      tree?.root.findAll(
        (node) => node.props.children === 'No protected days yet',
      ).length,
    ).toBeGreaterThan(0)
  })
})
