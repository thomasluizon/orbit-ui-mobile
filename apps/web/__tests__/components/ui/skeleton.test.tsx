import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Skeleton } from '@/components/ui/skeleton'

describe('Skeleton', () => {
  it('exposes its label, busy state, and final-layout variant', () => {
    render(<Skeleton variant="habit-row" label="Loading habits" />)

    const unit = screen.getByRole('progressbar', { name: 'Loading habits' })
    expect(unit).toHaveAttribute('aria-busy', 'true')
    expect(unit).not.toHaveAttribute('aria-hidden')
    expect(unit).toHaveAttribute('data-variant', 'habit-row')
  })

  it('renders every cell in a multirow grid on the supplied dimensions', () => {
    const { container } = render(
      <div style={{ height: 40 }}>
        <Skeleton variant="grid" label="Loading calendar" rows={3} cols={7} cell={40} gap={8} />
      </div>,
    )

    const grid = container.querySelector('[data-cols="7"]') as HTMLElement
    expect(grid).toHaveAttribute('data-rows', '3')
    expect(grid).toHaveStyle({
      gridTemplateColumns: 'repeat(7, 40px)',
      gridTemplateRows: 'repeat(3, 40px)',
      gap: '8px',
    })
    expect(grid.children).toHaveLength(21)
    expect(grid.firstElementChild).toHaveStyle({ width: '40px', height: '40px' })
  })

  it('uses only an opacity pulse and no sweep or spinner', () => {
    const { container } = render(<Skeleton variant="settings" label="Loading settings" />)

    expect(container.querySelectorAll('.skeleton-pulse').length).toBeGreaterThan(0)
    expect(container.innerHTML).not.toMatch(/gradient|shimmer|spinner/i)
  })
})
