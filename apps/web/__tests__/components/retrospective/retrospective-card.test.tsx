import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('dompurify', () => ({
  default: { sanitize: (html: string) => html },
}))

import { RetrospectiveCard } from '@/app/(app)/retrospective/_components/retrospective-card'

function baseProps() {
  return {
    retrospective: 'You stayed consistent this week.',
    fromCache: false,
    isLoading: false,
    isOnline: true,
    onRegenerate: vi.fn(),
  }
}

describe('RetrospectiveCard', () => {
  it('renders the retrospective text and the Astra eyebrow', () => {
    render(<RetrospectiveCard {...baseProps()} />)
    expect(
      screen.getByText('You stayed consistent this week.'),
    ).toBeInTheDocument()
    expect(screen.getByText('retrospective.astraEyebrow')).toBeInTheDocument()
  })

  it('renders the medical-advice disclosure', () => {
    render(<RetrospectiveCard {...baseProps()} />)
    expect(
      screen.getByText('aiDisclosure.notMedicalAdvice'),
    ).toBeInTheDocument()
  })

  it('renders bold markdown as a strong element', () => {
    render(
      <RetrospectiveCard {...{ ...baseProps(), retrospective: '**Highlight**' }} />,
    )
    expect(screen.getByText('Highlight').tagName).toBe('STRONG')
  })

  it('regenerate button fires onRegenerate when online and idle', () => {
    const props = baseProps()
    render(<RetrospectiveCard {...props} />)
    fireEvent.click(screen.getByText('retrospective.regenerate'))
    expect(props.onRegenerate).toHaveBeenCalled()
  })

  it('disables regenerate while loading', () => {
    render(<RetrospectiveCard {...{ ...baseProps(), isLoading: true }} />)
    expect(screen.getByText('retrospective.regenerate')).toBeDisabled()
  })

  it('disables regenerate while offline', () => {
    render(<RetrospectiveCard {...{ ...baseProps(), isOnline: false }} />)
    expect(screen.getByText('retrospective.regenerate')).toBeDisabled()
  })

  it('shows the cached note when the result is from cache', () => {
    render(<RetrospectiveCard {...{ ...baseProps(), fromCache: true }} />)
    expect(screen.getByText('retrospective.cached')).toBeInTheDocument()
  })

  it('hides the cached note when the result is fresh', () => {
    render(<RetrospectiveCard {...baseProps()} />)
    expect(screen.queryByText('retrospective.cached')).not.toBeInTheDocument()
  })
})
