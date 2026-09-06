import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SegmentedControl } from '@/components/ui/segmented-control'

const options = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
] as const

describe('SegmentedControl', () => {
  it('exposes one current view and changes only to another view', () => {
    const onChange = vi.fn()
    render(
      <SegmentedControl
        options={options}
        value="all"
        onChange={onChange}
        label="Goal views"
      />,
    )

    expect(screen.getByRole('radiogroup', { name: 'Goal views' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'All' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('radio', { name: 'All' }))
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('radio', { name: 'Completed' }))
    expect(onChange).toHaveBeenCalledWith('completed')
    expect(screen.getByRole('radio', { name: 'All' })).toHaveAttribute('aria-checked', 'true')
  })

  it('moves between enabled views with arrow keys', () => {
    const onChange = vi.fn()
    render(
      <SegmentedControl
        options={[
          options[0],
          { ...options[1], disabled: true },
          options[2],
        ]}
        value="all"
        onChange={onChange}
        label="Goal views"
      />,
    )

    fireEvent.keyDown(screen.getByRole('radio', { name: 'All' }), { key: 'ArrowRight' })
    expect(onChange).toHaveBeenCalledWith('completed')
  })
})

it('blocks disabled options independently of the whole control', () => {
  const onChange = vi.fn()
  const choices = [options[0], options[1], { ...options[2], disabled: true }] as const
  const { rerender } = render(<SegmentedControl options={choices} value="active" onChange={onChange} label="Views" />)
  expect(screen.getAllByRole('radio').filter((node) => node.getAttribute('aria-checked') === 'true')).toEqual([screen.getByRole('radio', { name: 'Active' })])
  fireEvent.click(screen.getByRole('radio', { name: 'Completed' }))
  expect(onChange).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('radio', { name: 'All' }))
  expect(onChange).toHaveBeenCalledExactlyOnceWith('all')
  onChange.mockClear()
  rerender(<SegmentedControl options={choices} value="active" onChange={onChange} label="Views" disabled />)
  for (const option of screen.getAllByRole('radio')) fireEvent.click(option)
  expect(onChange).not.toHaveBeenCalled()
})

it('keeps an enabled option in the keyboard path when the current view becomes disabled', () => {
  const onChange = vi.fn()
  render(<SegmentedControl options={[{ ...options[0], disabled: true }, options[1], options[2]]} value="all" onChange={onChange} label="Views" />)
  expect(screen.getByRole('radio', { name: 'Active' })).toHaveAttribute('tabindex', '0')
  fireEvent.keyDown(screen.getByRole('radio', { name: 'Active' }), { key: 'ArrowRight' })
  expect(onChange).toHaveBeenCalledExactlyOnceWith('completed')
})
