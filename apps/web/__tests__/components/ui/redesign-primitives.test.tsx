import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { OrbitMascot } from '@/components/ui/orbit-mascot'
import { Columns } from '@/components/ui/columns'
import { Fab } from '@/components/ui/fab'
import { Icon } from '@/components/ui/icon'
import { Lockup } from '@/components/ui/lockup'
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

    expect(screen.getByRole('group')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Zero: 0' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Ten: 10' })).toBeInTheDocument()
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

  it('keeps the measured ring static on mount and retargets later progress changes', async () => {
    const { container, rerender } = render(<ProgressRing value={0} label="Progress" />)
    const progressCircle = () => container.querySelector('circle:last-child')
    const circumference = 2 * Math.PI * 30

    expect(container.querySelector('circle:first-child')).toHaveAttribute('stroke', 'var(--track-empty)')
    expect(progressCircle()).toHaveAttribute('visibility', 'hidden')
    expect(Number(progressCircle()?.getAttribute('stroke-dashoffset'))).toBeCloseTo(circumference)
    await waitFor(() => expect(progressCircle()).toHaveClass('transition-[stroke-dashoffset]'))

    rerender(<ProgressRing value={40} label="Progress" />)
    expect(progressCircle()).not.toHaveAttribute('visibility', 'hidden')
    expect(progressCircle()).toHaveAttribute('stroke', 'var(--primary)')
    expect(Number(progressCircle()?.getAttribute('stroke-dashoffset'))).toBeCloseTo(circumference * 0.6)
    expect(progressCircle()).toHaveClass('transition-[stroke-dashoffset]')
    expect(progressCircle()).toHaveClass('motion-reduce:transition-none')

    rerender(<ProgressRing value={70} label="Progress" />)
    rerender(<ProgressRing value={99.9} label="Progress" />)
    expect(Number(progressCircle()?.getAttribute('stroke-dashoffset'))).toBeCloseTo(circumference * 0.001)

    rerender(<ProgressRing value={100} label="Progress" />)
    expect(container.querySelector('svg')).toHaveAttribute('data-complete')
    expect(progressCircle()).toHaveAttribute('stroke', 'var(--fg-3)')
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

  it('presses the FAB with a 0.96 scale only when motion is allowed, and keeps the pressed fill', () => {
    render(<Fab label="Create">+</Fab>)
    const button = screen.getByRole('button', { name: 'Create' })
    expect(button).toHaveClass('motion-safe:active:scale-[0.96]')
    expect(button).not.toHaveClass('active:scale-[0.96]')
    expect(button).toHaveAttribute('data-fab', '')
    expect(button.querySelector('[data-press-fill]')).toBeNull()
  })

  it.each([16, 20, 24] as const)('draws the small static face at %ipx with the moon as the only accent', (size) => {
    const { container } = render(<OrbitMascot size={size} />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('data-asset', 'orbit-mascot')
    expect(svg).toHaveAttribute('data-orbit-face', 'small')
    expect(svg).toHaveAttribute('data-orbit-loop', 'still')
    expect(svg).toHaveAttribute('width', String(size))
    expect(svg).toHaveAttribute('height', String(size * 0.75))
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('color', 'var(--fg-1)')
    expect(container.querySelectorAll('[data-part="eye"]')).toHaveLength(2)
    expect(container.querySelector('[data-part="moon"]')).toHaveAttribute('fill', 'var(--primary)')
    expect(container.querySelectorAll('[fill="var(--primary)"]')).toHaveLength(1)
  })

  it.each([48, 96, 128] as const)('draws the live rig at %ipx in the 7 by 5 box', (size) => {
    const { container } = render(<OrbitMascot size={size} still />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('data-orbit-face', 'rig')
    expect(svg).toHaveAttribute('data-orbit-state', 'parado')
    expect(svg).toHaveAttribute('viewBox', '-210 -150 420 300')
    expect(svg).toHaveAttribute('width', String(size))
    expect(svg).toHaveAttribute('height', String((size * 300) / 420))
    expect((22 / 420) * size).toBeGreaterThanOrEqual(2)
    expect(container.querySelectorAll('[fill="var(--primary)"]')).toHaveLength(1)
  })

  it.each(['parado', 'pensando', 'feliz', 'descansando'] as const)('exposes the %s state and draws two eyes', (state) => {
    const { container } = render(<OrbitMascot size={96} state={state} still />)
    expect(container.querySelector('svg')).toHaveAttribute('data-orbit-state', state)
    expect(container.querySelectorAll('[data-part="eye"]')).toHaveLength(2)
    const arcs = container.querySelectorAll('[data-part="eye"][stroke]')
    expect(arcs).toHaveLength(state === 'feliz' ? 2 : 0)
  })

  it('honours the color of the planet and the ring', () => {
    const { container } = render(<OrbitMascot size={16} color="#123456" />)
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
    expect(svg).toHaveAttribute('viewBox', '-0.000400046 0.000000000 89.395902732 17.742772815')
    expect(container.querySelector('text')).toBeNull()
  })
})
