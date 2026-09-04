import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Skeleton } from '@/components/ui/skeleton'

function staticTokenValue(token: string): string {
  const stylesheet = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8')
  const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return stylesheet.match(new RegExp(`${escapedToken}:\\s*([^;]+);`))?.[1]?.trim() ?? ''
}

function installStaticTokenStyle(token: string) {
  const style = document.createElement('style')
  style.textContent = `
    * { border-radius: 0px; }
    [class~="rounded-[var(${token})]"] { border-radius: ${staticTokenValue(token)}; }
  `
  document.head.append(style)
}

describe('Skeleton', () => {
  afterEach(() => {
    document.head.innerHTML = ''
  })

  it('exposes its label, busy state, and final-layout variant', () => {
    render(<Skeleton variant="habit-row" label="Loading habits" />)

    const unit = screen.getByRole('progressbar', { name: 'Loading habits' })
    expect(unit).toHaveAttribute('aria-busy', 'true')
    expect(unit).not.toHaveAttribute('aria-hidden')
    expect(unit).toHaveAttribute('data-variant', 'habit-row')
  })

  it('renders habit cards with the specified 20px radius', () => {
    installStaticTokenStyle('--r-card')
    render(<Skeleton variant="habit-row" label="Loading habits" />)

    const unit = screen.getByRole('progressbar', { name: 'Loading habits' })
    const card = unit.firstElementChild
    expect(card).toBeInstanceOf(HTMLElement)
    expect(getComputedStyle(card as HTMLElement).borderRadius).toBe('20px')
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
