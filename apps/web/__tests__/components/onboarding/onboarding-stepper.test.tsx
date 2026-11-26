import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MAX_HABIT_INTERVAL_WEEKS } from '@orbit/shared/types/habit'
import { Stepper } from '@/components/onboarding/onboarding-stepper'

function renderStepper(value: number, bounds: { minimum: number; maximum?: number }, onChange = vi.fn()) {
  render(<Stepper value={value} {...bounds} lessLabel="less" moreLabel="more" description="weeks" onChange={onChange} />)
  return { onChange, less: screen.getByRole('button', { name: 'less' }), more: screen.getByRole('button', { name: 'more' }) }
}

function Controlled({ start, minimum, maximum }: Readonly<{ start: number; minimum: number; maximum?: number }>) {
  const [value, setValue] = useState(start)
  return <Stepper value={value} minimum={minimum} maximum={maximum} lessLabel="less" moreLabel="more" description="weeks" onChange={setValue} />
}

describe('onboarding Stepper', () => {
  it('disables less at the minimum and leaves more open', () => {
    const { less, more, onChange } = renderStepper(1, { minimum: 1, maximum: MAX_HABIT_INTERVAL_WEEKS })
    expect(less).toBeDisabled()
    expect(more).toBeEnabled()
    fireEvent.click(less)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('disables more at MAX_HABIT_INTERVAL_WEEKS and leaves less open', () => {
    const { less, more, onChange } = renderStepper(MAX_HABIT_INTERVAL_WEEKS, { minimum: 1, maximum: MAX_HABIT_INTERVAL_WEEKS })
    expect(more).toBeDisabled()
    expect(less).toBeEnabled()
    fireEvent.click(more)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('leaves both buttons open between the bounds and moves the value by one for each press', () => {
    const { less, more, onChange } = renderStepper(5, { minimum: 1, maximum: MAX_HABIT_INTERVAL_WEEKS })
    expect(less).toBeEnabled()
    expect(more).toBeEnabled()
    fireEvent.click(more)
    expect(onChange).toHaveBeenLastCalledWith(6)
    fireEvent.click(less)
    expect(onChange).toHaveBeenLastCalledWith(4)
  })

  it('walks from the minimum to the maximum one step at a time and stops there', () => {
    render(<Controlled start={MAX_HABIT_INTERVAL_WEEKS - 2} minimum={1} maximum={MAX_HABIT_INTERVAL_WEEKS} />)
    const more = screen.getByRole('button', { name: 'more' })
    fireEvent.click(more)
    expect(screen.getByText(String(MAX_HABIT_INTERVAL_WEEKS - 1))).toBeInTheDocument()
    fireEvent.click(more)
    expect(screen.getByText(String(MAX_HABIT_INTERVAL_WEEKS))).toBeInTheDocument()
    expect(more).toBeDisabled()
    fireEvent.click(more)
    expect(screen.getByText(String(MAX_HABIT_INTERVAL_WEEKS))).toBeInTheDocument()
  })

  it('never emits a value above the maximum when a press slips past the disabled state', () => {
    const { more, onChange } = renderStepper(MAX_HABIT_INTERVAL_WEEKS, { minimum: 1, maximum: MAX_HABIT_INTERVAL_WEEKS })
    const propsKey = Object.keys(more).find((key) => key.startsWith('__reactProps'))!
    ;(more as unknown as Record<string, { onClick: () => void }>)[propsKey]!.onClick()
    expect(onChange).toHaveBeenCalledWith(MAX_HABIT_INTERVAL_WEEKS)
  })

  it('has no upper bound when the caller sets none', () => {
    const { more, onChange } = renderStepper(500, { minimum: 1 })
    expect(more).toBeEnabled()
    fireEvent.click(more)
    expect(onChange).toHaveBeenLastCalledWith(501)
  })
})
