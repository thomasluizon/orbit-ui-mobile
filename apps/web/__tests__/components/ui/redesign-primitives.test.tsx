import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { Columns } from '@/components/ui/columns'
import { Fab } from '@/components/ui/fab'
import { Icon } from '@/components/ui/icon'
import { Lockup } from '@/components/ui/lockup'
import { OrbitMark } from '@/components/ui/orbit-mark'
import { ProgressRing } from '@/components/ui/progress-ring'

describe('redesign primitives on web', () => {
  it('renders a measured zero as a 2px column without using the empty words', () => {
    const { container } = render(
      <Columns
        columns={[
          { id: 'zero', label: 'Zero', value: 0 },
          { id: 'ten', label: 'Ten', value: 10 },
        ]}
        emptyLabel="No measurements"
      />,
    )

    expect(screen.getByLabelText('Zero: 0')).toBeInTheDocument()
    const zeroFill = container.querySelector('[data-zero] [aria-hidden="true"] > span')
    expect(zeroFill).toHaveStyle({ height: '2px' })
  })

  it('uses the tallest column or a supplied shared maximum as its scale', () => {
    const { container, rerender } = render(
      <Columns columns={[{ id: 'one', label: 'One', value: 10 }]} emptyLabel="Empty" />,
    )
    const fill = () => container.querySelector('[aria-hidden="true"] > span')
    expect(fill()).toHaveStyle({ height: '100%' })

    rerender(
      <Columns columns={[{ id: 'one', label: 'One', value: 10 }]} max={20} emptyLabel="Empty" />,
    )
    expect(fill()).toHaveStyle({ height: '50%' })
  })

  it('draws unfinished ring progress in accent and completion in neutral', () => {
    const { container, rerender } = render(<ProgressRing value={40} label="Progress" />)
    expect(container.querySelector('circle:last-child')).toHaveAttribute('stroke', 'var(--primary)')

    rerender(<ProgressRing value={100} label="Progress" />)
    expect(container.querySelector('svg')).toHaveAttribute('data-complete')
    expect(container.querySelector('circle:last-child')).toHaveAttribute('stroke', 'var(--fg-3)')
  })

  it('keeps the FAB labelled, accent filled, and actionable', () => {
    const onClick = vi.fn()
    render(<Fab label="Create" onClick={onClick}>+</Fab>)
    const button = screen.getByRole('button', { name: 'Create' })
    expect(button).toHaveAttribute('data-fab')
    expect(button).toHaveStyle({ borderRadius: '999px', height: '60px', width: '60px' })
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('selects native brand redraws and limits the mark accent to its moon', () => {
    const { container, rerender } = render(<OrbitMark size={16} />)
    expect(container.querySelector('svg')).toHaveAttribute('data-asset', 'orbit-mark-16')
    expect(container.querySelectorAll('path[data-part="moon"]')[0]).toHaveAttribute('fill', 'currentColor')

    rerender(<OrbitMark size={24} accent />)
    expect(container.querySelector('svg')).toHaveAttribute('data-asset', 'orbit-mark-accent')
    const paths = container.querySelectorAll('path')
    expect(paths[0]).toHaveAttribute('fill', 'currentColor')
    expect(paths[paths.length - 1]).toHaveAttribute('fill', 'var(--primary)')
  })

  it('lets the Astra glyph inherit currentColor and selects its native redraw', () => {
    const { container, rerender } = render(<AstraGlyph size={16} />)
    expect(container.querySelector('svg')).toHaveAttribute('data-asset', 'astra-mark-16')
    expect(container.querySelector('svg')).toHaveAttribute('color', 'currentColor')

    rerender(<AstraGlyph size={24} color="#123456" />)
    expect(container.querySelector('svg')).toHaveAttribute('data-asset', 'astra-mark')
    expect(container.querySelector('svg')).toHaveAttribute('color', '#123456')
  })

  it('centres icons at the default size and makes accessibility deliberate', () => {
    const { container, rerender } = render(<Icon name="home" />)
    const decorative = container.querySelector('[data-icon="home"]')
    expect(decorative).toHaveAttribute('aria-hidden', 'true')
    expect(decorative).toHaveStyle({ display: 'inline-flex', height: '24px', width: '24px' })

    rerender(<Icon name="home" label="Home" />)
    expect(screen.getByRole('img', { name: 'Home' })).toBeInTheDocument()
  })

  it('renders the outlined lockup with fixed geometry and no text node', () => {
    const { container } = render(<Lockup />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('data-asset', 'orbit-lockup')
    expect(svg).toHaveAttribute('viewBox', '-0.000000087 0 89.395502773 17.882739221')
    expect(container.querySelector('text')).toBeNull()
  })
})
