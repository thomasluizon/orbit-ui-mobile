import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lucide-react')>()
  return {
    ...actual,
    AlertTriangle: (props: Record<string, unknown>) => <svg data-testid="alert-triangle" {...props} />,
  }
})

import AppError from '@/app/(app)/error'
import AuthError from '@/app/(auth)/error'

// ---------------------------------------------------------------------------
// (app) error page
// ---------------------------------------------------------------------------

describe('AppError', () => {
  const mockReset = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders generic error message in non-development env', () => {
    const error = new Error('Something went wrong') as Error & { digest?: string }
    render(<AppError error={error} reset={mockReset} />)
    expect(screen.getByText('auth.genericError')).toBeInTheDocument()
  })

  it('renders the alert triangle icon', () => {
    const error = new Error('fail') as Error & { digest?: string }
    render(<AppError error={error} reset={mockReset} />)
    expect(screen.getByTestId('alert-triangle')).toBeInTheDocument()
  })

  it('falls back to generic error key when message is empty', () => {
    const error = new Error('') as Error & { digest?: string }
    render(<AppError error={error} reset={mockReset} />)
    expect(screen.getByText('auth.genericError')).toBeInTheDocument()
  })

  it('renders the retry button with correct label', () => {
    const error = new Error('fail') as Error & { digest?: string }
    render(<AppError error={error} reset={mockReset} />)
    expect(screen.getByText('common.retry')).toBeInTheDocument()
  })

  it('calls reset when retry button is clicked', () => {
    const error = new Error('fail') as Error & { digest?: string }
    render(<AppError error={error} reset={mockReset} />)
    fireEvent.click(screen.getByText('common.retry'))
    expect(mockReset).toHaveBeenCalledTimes(1)
  })

  it('handles error with digest property', () => {
    const error = Object.assign(new Error('Server error'), { digest: 'abc123' })
    render(<AppError error={error} reset={mockReset} />)
    expect(screen.getByText('auth.genericError')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// (auth) error page
// ---------------------------------------------------------------------------

describe('AuthError', () => {
  const mockReset = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders generic error message in non-development env', () => {
    const error = new Error('Auth failed') as Error & { digest?: string }
    render(<AuthError error={error} reset={mockReset} />)
    expect(screen.getByText('auth.genericError')).toBeInTheDocument()
  })

  it('falls back to generic error key when message is empty', () => {
    const error = new Error('') as Error & { digest?: string }
    render(<AuthError error={error} reset={mockReset} />)
    expect(screen.getByText('auth.genericError')).toBeInTheDocument()
  })

  it('renders the retry button', () => {
    const error = new Error('fail') as Error & { digest?: string }
    render(<AuthError error={error} reset={mockReset} />)
    expect(screen.getByText('common.retry')).toBeInTheDocument()
  })

  it('calls reset when retry button is clicked', () => {
    const error = new Error('fail') as Error & { digest?: string }
    render(<AuthError error={error} reset={mockReset} />)
    fireEvent.click(screen.getByText('common.retry'))
    expect(mockReset).toHaveBeenCalledTimes(1)
  })

  it('renders the SVG warning icon', () => {
    const error = new Error('fail') as Error & { digest?: string }
    const { container } = render(<AuthError error={error} reset={mockReset} />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
  })

  it('handles error with digest property', () => {
    const error = Object.assign(new Error('Session expired'), { digest: 'xyz789' })
    render(<AuthError error={error} reset={mockReset} />)
    expect(screen.getByText('auth.genericError')).toBeInTheDocument()
  })
})
