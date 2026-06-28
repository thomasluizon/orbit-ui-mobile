import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const mockToggleRail = vi.fn()
let railOpen = false

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/stores/shell-store', () => ({
  useShellStore: (
    selector: (state: { railOpen: boolean; toggleRail: typeof mockToggleRail }) => unknown,
  ) => selector({ railOpen, toggleRail: mockToggleRail }),
}))

import { RailToggle } from '@/components/shell/rail-drawer'

beforeEach(() => {
  railOpen = false
  mockToggleRail.mockClear()
})

describe('RailToggle', () => {
  it('toggles the rail when clicked', () => {
    render(<RailToggle />)
    fireEvent.click(screen.getByLabelText('shell.openRail'))
    expect(mockToggleRail).toHaveBeenCalledTimes(1)
  })

  it('labels the control as "open" while the rail is closed', () => {
    render(<RailToggle />)
    const button = screen.getByLabelText('shell.openRail')
    expect(button).toHaveAttribute('aria-expanded', 'false')
  })

  it('labels the control as "close" and marks it expanded while the rail is open', () => {
    railOpen = true
    render(<RailToggle />)
    const button = screen.getByLabelText('shell.closeRail')
    expect(button).toHaveAttribute('aria-expanded', 'true')
  })
})
