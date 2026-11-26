import React, { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { MAX_HABIT_INTERVAL_WEEKS } from '@orbit/shared/types/habit'
import { Stepper } from '@/components/onboarding/onboarding-stepper'
import { renderedText } from '@/__tests__/support/react-test-renderer'
import { press, renderNavigation } from '../ui/navigation-render'

const colors = { fg1: '#fff', fg2: '#ccc', fg3: '#999', bgWell: '#111', bgHover: '#222', hairline: '#333' }

function buttons(tree: ReturnType<typeof renderNavigation>) {
  const hosts = tree.hosts().filter((node) => node.props.accessibilityRole === 'button')
  return { less: hosts.find((node) => node.props.accessibilityLabel === 'less')!, more: hosts.find((node) => node.props.accessibilityLabel === 'more')! }
}

function renderStepper(value: number, bounds: { minimum: number; maximum?: number }, onChange = vi.fn()) {
  const tree = renderNavigation(<Stepper value={value} {...bounds} lessLabel="less" moreLabel="more" description="weeks" colors={colors} onChange={onChange} />)
  return { tree, onChange, ...buttons(tree) }
}

function Controlled({ start, minimum, maximum }: Readonly<{ start: number; minimum: number; maximum?: number }>) {
  const [value, setValue] = useState(start)
  return <Stepper value={value} minimum={minimum} maximum={maximum} lessLabel="less" moreLabel="more" description="weeks" colors={colors} onChange={setValue} />
}

describe('mobile onboarding Stepper', () => {
  it('disables less at the minimum and leaves more open', () => {
    const { less, more, onChange } = renderStepper(1, { minimum: 1, maximum: MAX_HABIT_INTERVAL_WEEKS })
    expect(less.props.disabled).toBe(true)
    expect(more.props.disabled).toBe(false)
    press(less)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('disables more at MAX_HABIT_INTERVAL_WEEKS and leaves less open', () => {
    const { less, more, onChange } = renderStepper(MAX_HABIT_INTERVAL_WEEKS, { minimum: 1, maximum: MAX_HABIT_INTERVAL_WEEKS })
    expect(more.props.disabled).toBe(true)
    expect(less.props.disabled).toBe(false)
    press(more)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('leaves both buttons open between the bounds and moves the value by one for each press', () => {
    const { less, more, onChange } = renderStepper(5, { minimum: 1, maximum: MAX_HABIT_INTERVAL_WEEKS })
    expect(less.props.disabled).toBe(false)
    expect(more.props.disabled).toBe(false)
    press(more)
    expect(onChange).toHaveBeenLastCalledWith(6)
    press(less)
    expect(onChange).toHaveBeenLastCalledWith(4)
  })

  it('walks up to the maximum one step at a time and stops there', () => {
    const tree = renderNavigation(<Controlled start={MAX_HABIT_INTERVAL_WEEKS - 2} minimum={1} maximum={MAX_HABIT_INTERVAL_WEEKS} />)
    const count = () => renderedText(tree.hosts()[0]!)
    press(buttons(tree).more)
    expect(count()).toContain(String(MAX_HABIT_INTERVAL_WEEKS - 1))
    press(buttons(tree).more)
    expect(count()).toContain(String(MAX_HABIT_INTERVAL_WEEKS))
    expect(buttons(tree).more.props.disabled).toBe(true)
    press(buttons(tree).more)
    expect(count()).toContain(String(MAX_HABIT_INTERVAL_WEEKS))
    expect(count()).not.toContain(String(MAX_HABIT_INTERVAL_WEEKS + 1))
  })

  it('never emits a value above the maximum when a press slips past the disabled state', () => {
    const { more, onChange } = renderStepper(MAX_HABIT_INTERVAL_WEEKS, { minimum: 1, maximum: MAX_HABIT_INTERVAL_WEEKS })
    more.props.onPress?.()
    expect(onChange).toHaveBeenCalledWith(MAX_HABIT_INTERVAL_WEEKS)
  })

  it('has no upper bound when the caller sets none', () => {
    const { more, onChange } = renderStepper(500, { minimum: 1 })
    expect(more.props.disabled).toBe(false)
    press(more)
    expect(onChange).toHaveBeenLastCalledWith(501)
  })
})
