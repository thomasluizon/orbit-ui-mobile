import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SegmentedControl } from '@/components/ui/segmented-control'

const options = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'completed', label: 'Completed' },
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
