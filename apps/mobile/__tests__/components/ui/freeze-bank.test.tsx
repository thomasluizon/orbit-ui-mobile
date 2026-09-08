import { describe, expect, it } from 'vitest'
import type { ReactTestRenderer } from 'react-test-renderer'
import type { FreezeBankWords } from '@orbit/shared/contracts/display'
import { FreezeBank } from '@/components/ui/freeze-bank'

const TestRenderer = require('react-test-renderer') as typeof import('react-test-renderer')

const words: FreezeBankWords = {
  active: 'Active',
  frozen: 'Frozen',
  missed: 'Missed',
  today: 'Today',
  legendLabel: 'Streak day legend',
  bankedLabel: 'Banked',
  usedLabel: 'Used this month',
  nextLabel: 'Next freeze',
  nextProgressLabel: 'Progress to next freeze',
  nextFreezeProgress: '4 of 7 streak days',
  protectedLabel: 'Protected days',
  protectedEmpty: 'No protected days yet',
  protectedDay: 'Protected',
  protectedToday: 'Protected today',
}

function renderBank(banked: number) {
  let tree: ReactTestRenderer | undefined
  void TestRenderer.act(() => {
    tree = TestRenderer.create(<FreezeBank banked={banked} ceiling={3} usedThisMonth={1}
      daysTowardNext={4} earnRateDays={7} tierValue="Silver" tierLabel="Streak tier"
      longestValue={21} longestLabel="Best streak" protectedDays={[]} words={words} />)
  })
  return tree!
}

describe('FreezeBank (mobile)', () => {
  it('shows three named marks, both tiles and bank bookkeeping without a disclosure', () => {
    const tree = renderBank(2)
    const text = tree.root.findAll((node) => typeof node.props.children === 'string').map((node) => node.props.children)
    expect(text).toContain('Banked')
    expect(text).toEqual(expect.arrayContaining(['Active', 'Frozen', 'Missed', 'Best streak', 'Silver', '4 of 7 streak days', 'No protected days yet']))
    expect(text).not.toContain('Today')
    expect(tree.root.findAll((node) => node.props.testID === 'freeze-bank-disclosure')).toHaveLength(0)
    const bars = tree.root.findAll((node) => node.props.accessibilityRole === 'progressbar')
    expect(bars[0]?.props.accessibilityValue).toEqual({ min: 0, max: 7, now: 4 })
  })

  it('omits the entire earning row while full and resumes after the bank drops', () => {
    const full = renderBank(3)
    expect(full.root.findAll((node) => node.props.children === 'Banked').length).toBeGreaterThan(0)
    expect(full.root.findAll((node) => node.props.children === 'Next freeze')).toHaveLength(0)
    expect(full.root.findAll((node) => node.props.accessibilityRole === 'progressbar')).toHaveLength(0)
    const earning = renderBank(2)
    expect(earning.root.findAll((node) => node.props.accessibilityRole === 'progressbar')[0]?.props.accessibilityValue).toEqual({ min: 0, max: 7, now: 4 })
  })
})
