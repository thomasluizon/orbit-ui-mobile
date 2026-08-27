import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StepUp } from '@/components/ui/step-up'

describe('StepUp', () => {
  it('renders one handoff action and no credential field', () => {
    const onAction = vi.fn()
    render(<StepUp message="Sign in again to continue." actionLabel="Sign in" onAction={onAction} />)

    expect(screen.queryByRole('textbox')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(onAction).toHaveBeenCalledTimes(1)
  })

  it('announces the busy handoff state', () => {
    const { container } = render(
      <StepUp message="Sign in again to continue." actionLabel="Sign in" onAction={() => {}} busy />,
    )
    expect(container.querySelector('section')).toHaveAttribute('aria-busy', 'true')
  })
})
