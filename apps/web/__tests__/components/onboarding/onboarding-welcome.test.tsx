import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { OnboardingWelcome } from '@/components/onboarding/onboarding-welcome'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

describe('OnboardingWelcome', () => {
  it('fills the system multiline input from a starter', () => {
    const onChange = vi.fn()
    render(<OnboardingWelcome sentence="" marks={[]} onChange={onChange} />)
    expect(screen.getByRole('textbox')).toHaveAttribute('maxlength', '100')
    expect(screen.getByRole('textbox')).toHaveAttribute('rows', '3')
    fireEvent.click(screen.getByText('what.starters.water'))
    expect(onChange).toHaveBeenCalledWith('what.starters.water')
  })

  it('only shows the account link when supplied', () => {
    const { rerender } = render(<OnboardingWelcome sentence="" marks={[]} onChange={vi.fn()} />)
    expect(screen.queryByText('what.haveAccount')).not.toBeInTheDocument()
    rerender(<OnboardingWelcome sentence="" marks={[]} onChange={vi.fn()} onHaveAccount={vi.fn()} />)
    expect(screen.getByText('what.haveAccount')).toBeInTheDocument()
  })

  it('exposes parsed words through the required marks label', () => {
    render(
      <OnboardingWelcome
        sentence="Walk every day"
        marks={[{ start: 5, end: 10, kind: 'daily' }]}
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('list', { name: 'what.marksLabel' })).toHaveTextContent('every')
  })
})
