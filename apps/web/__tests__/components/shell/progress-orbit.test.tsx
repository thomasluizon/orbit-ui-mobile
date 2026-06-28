import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProgressOrbit } from '@/components/shell/progress-orbit'

const baseProps = {
  label: 'In progress',
  completeLabel: 'All done',
  ariaLabel: '2 of 5 habits done',
}

describe('ProgressOrbit', () => {
  it('exposes the provided aria-label on the image role', () => {
    render(<ProgressOrbit {...baseProps} done={2} total={5} />)

    expect(screen.getByRole('img', { name: '2 of 5 habits done' })).toBeInTheDocument()
  })

  it('renders the done count and total', () => {
    render(<ProgressOrbit {...baseProps} done={2} total={5} />)

    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('/5')).toBeInTheDocument()
  })

  it('shows the in-progress label while habits remain', () => {
    render(<ProgressOrbit {...baseProps} done={2} total={5} />)

    expect(screen.getByText('In progress')).toBeInTheDocument()
    expect(screen.queryByText('All done')).not.toBeInTheDocument()
  })

  it('shows the complete label once every habit is done', () => {
    render(<ProgressOrbit {...baseProps} done={5} total={5} />)

    expect(screen.getByText('All done')).toBeInTheDocument()
    expect(screen.queryByText('In progress')).not.toBeInTheDocument()
  })

  it('treats an empty day as in progress rather than complete', () => {
    render(<ProgressOrbit {...baseProps} done={0} total={0} />)

    expect(screen.getByText('In progress')).toBeInTheDocument()
    expect(screen.queryByText('All done')).not.toBeInTheDocument()
  })

  it('clamps an over-count done to the total', () => {
    render(<ProgressOrbit {...baseProps} done={9} total={5} />)

    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('All done')).toBeInTheDocument()
  })

  it('renders one satellite per habit at or below the cap and none above it', () => {
    const { container: aboveCap } = render(
      <ProgressOrbit {...baseProps} done={0} total={13} />,
    )
    const baseCircles = aboveCap.querySelectorAll('circle').length

    const { container: atCap } = render(<ProgressOrbit {...baseProps} done={0} total={12} />)
    expect(atCap.querySelectorAll('circle').length).toBe(baseCircles + 12)

    const { container: belowCap } = render(<ProgressOrbit {...baseProps} done={0} total={5} />)
    expect(belowCap.querySelectorAll('circle').length).toBe(baseCircles + 5)
  })
})
