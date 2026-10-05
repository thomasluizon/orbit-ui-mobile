import { describe, expect, it, vi } from 'vitest'
import * as ReactNative from 'react-native'
import { StyleSheet, type ViewStyle } from 'react-native'
import type { ReactTestRenderer } from 'react-test-renderer'
import type { FreezeBankWords } from '@orbit/shared/contracts/display'
import { FreezeBank } from '@/components/ui/freeze-bank'

const TestRenderer = require('react-test-renderer') as typeof import('react-test-renderer')

type RenderedNode = {
  type: unknown
  props: Record<string, unknown>
  parent: RenderedNode | null
  children: (RenderedNode | string)[]
  findAll: (predicate: (node: RenderedNode) => boolean) => RenderedNode[]
}

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
  it.each([
    { width: 320, fontScale: 1, banked: 2, direction: 'column' },
    { width: 412, fontScale: 1, banked: 2, direction: 'row' },
    { width: 840, fontScale: 1, banked: 3, direction: 'row' },
    { width: 412, fontScale: 2, banked: 3, direction: 'column' },
  ])('spaces the bank groups and $direction tiles by 16 at $width with text scale $fontScale', ({ width, fontScale, banked, direction }) => {
    const dimensions = vi.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({ width, height: 915, scale: 1, fontScale })
    const tree = renderBank(banked)
    try {
      const root = tree.root as unknown as RenderedNode
      const bank = root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'freeze-bank')[0]!
      const groups = bank.children.filter((node) => typeof node !== 'string')
      expect(groups).toHaveLength(4)
      expect(StyleSheet.flatten(bank.props.style as ViewStyle).gap).toBe(16)
      const tile = bank.findAll((node) => typeof node.type === 'string' && node.props.testID === 'stat-tile-default')[0]!
      let row = tile.parent!
      while (!StyleSheet.flatten<ViewStyle>(row.props.style ?? {}).flexDirection) row = row.parent!
      expect(StyleSheet.flatten(row.props.style as ViewStyle)).toMatchObject({ gap: 16, flexDirection: direction })
      const bankedLabel = bank.findAll((node) => node.type === 'Text' && node.props.children === words.bankedLabel)[0]!
      let bookkeeping = bankedLabel.parent!
      while (!StyleSheet.flatten<ViewStyle>(bookkeeping.props.style ?? {}).flexDirection) bookkeeping = bookkeeping.parent!
      expect(StyleSheet.flatten(bookkeeping.props.style as ViewStyle).gap).toBe(12)
    } finally {
      void TestRenderer.act(() => tree.update(<></>))
      dimensions.mockRestore()
    }
  })

  it('keeps bank bookkeeping inline and discloses the three named marks', () => {
    const tree = renderBank(2)
    const text = tree.root.findAll((node) => typeof node.props.children === 'string').map((node) => node.props.children)
    expect(text).toContain('Banked')
    expect(text).toEqual(expect.arrayContaining(['Best streak', 'Silver', '4 of 7 streak days', 'No protected days yet']))
    expect(text).not.toContain('Today')
    expect(text).not.toContain('Active')
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
