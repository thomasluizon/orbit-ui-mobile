import type { ReactElement } from 'react'
import { act, create } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { BarChart } from '@/components/ui/bar-chart'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, values?: { done: number; scheduled: number }) =>
    key === 'charts.bar.readout' ? `${values?.done} of ${values?.scheduled}` : key }),
}))

interface TestNode {
  readonly props: Readonly<Record<string, unknown>>
  findByProps(props: Readonly<Record<string, unknown>>): TestNode
  findAllByType(type: string): TestNode[]
}

function render(element: ReactElement): TestNode {
  let tree: { root: TestNode } | undefined
  void act(() => { tree = create(element) as unknown as { root: TestNode } })
  if (!tree) throw new Error('Chart did not mount')
  return tree.root
}

describe('BarChart on mobile', () => {
  it('uses one adjustable target and advances on accessibility increment', () => {
    const points = Array.from({ length: 7 }, (_, index) => ({ dateLabel: `Sep ${index + 1}`, rate: 50, scheduled: 2, completed: 1 }))
    const root = render(<BarChart points={points} label="Last 30 days" />)
    const control = root.findByProps({ testID: 'bar-chart-control' })
    expect(control.props.accessibilityRole).toBe('adjustable')
    void act(() => {
      ;(control.props.onLayout as (event: unknown) => void)({ nativeEvent: { layout: { width: 320 } } })
      ;(control.props.onAccessibilityAction as (event: unknown) => void)({ nativeEvent: { actionName: 'decrement' } })
    })
    expect(root.findAllByType('Path')).toHaveLength(7)
    expect(root.findByProps({ testID: 'bar-chart-control' }).props.accessibilityValue).toMatchObject({ now: 6 })
    void act(() => {
      ;(control.props.onAccessibilityAction as (event: unknown) => void)({ nativeEvent: { actionName: 'increment' } })
    })
    expect(root.findByProps({ testID: 'bar-chart-control' }).props.accessibilityValue).toMatchObject({ now: 7 })
  })
})
