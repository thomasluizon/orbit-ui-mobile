import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import { SelectAllToggle } from '@/app/(app)/calendar-sync/_components/select-all-toggle'

const selectAllLabel = 'Select all'
const deselectAllLabel = 'Deselect all'

describe('SelectAllToggle', () => {
  it('labels the action as select-all when nothing is selected', () => {
    render(
      <SelectAllToggle
        allSelected={false}
        onToggle={vi.fn()}
        selectAllLabel={selectAllLabel}
        deselectAllLabel={deselectAllLabel}
      />,
    )
    const button = screen.getByRole('button')
    expect(button.getAttribute('aria-label')).toBe(selectAllLabel)
    expect(button.getAttribute('title')).toBe(selectAllLabel)
    expect(button.getAttribute('aria-pressed')).toBe('false')
  })

  it('labels the action as deselect-all when everything is selected', () => {
    render(
      <SelectAllToggle
        allSelected={true}
        onToggle={vi.fn()}
        selectAllLabel={selectAllLabel}
        deselectAllLabel={deselectAllLabel}
      />,
    )
    const button = screen.getByRole('button')
    expect(button.getAttribute('aria-label')).toBe(deselectAllLabel)
    expect(button.getAttribute('title')).toBe(deselectAllLabel)
    expect(button.getAttribute('aria-pressed')).toBe('true')
  })

  it('calls onToggle when clicked', () => {
    const onToggle = vi.fn()
    render(
      <SelectAllToggle
        allSelected={false}
        onToggle={onToggle}
        selectAllLabel={selectAllLabel}
        deselectAllLabel={deselectAllLabel}
      />,
    )
    fireEvent.click(screen.getByRole('button'))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})
