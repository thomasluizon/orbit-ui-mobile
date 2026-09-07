import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { captureException } from '@sentry/nextjs'

vi.mock('next-intl', () => ({
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useTranslations: () => (key: string) => key,
}))

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}))

vi.mock('next/font/google', () => ({
  Space_Grotesk: () => ({ variable: 'font-display' }),
  Geist_Mono: () => ({ variable: 'font-mono' }),
  Geist: () => ({ variable: 'font-geist', className: 'font-geist' }),
}))

vi.mock('@/components/ui/icons', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui/icons')>()
  return {
    ...actual,
    TriangleAlert: (props: Record<string, unknown>) => <svg data-testid="triangle-alert" {...props} />,
  }
})

import AppError from '@/app/(app)/error'
import AuthError from '@/app/(auth)/error'
import GlobalError from '@/app/global-error'


describe('AppError', () => {
  const mockReset = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    { name: 'renders generic error message in non-development env', error: new Error('Something went wrong') as Error & { digest?: string } },
    { name: 'falls back to generic error key when message is empty', error: new Error('') as Error & { digest?: string } },
    { name: 'handles error with digest property', error: Object.assign(new Error('Server error'), { digest: 'abc123' }) },
  ])('$name', ({ error }) => {
    render(<AppError error={error} reset={mockReset} />)
    expect(screen.getByText('errorScreen.title')).toBeInTheDocument()
  })

  it('renders the retry button with correct label', () => {
    const error = new Error('fail') as Error & { digest?: string }
    render(<AppError error={error} reset={mockReset} />)
    expect(screen.getByText('errorScreen.retry')).toBeInTheDocument()
  })

  it('calls reset when retry button is clicked', () => {
    const error = new Error('fail') as Error & { digest?: string }
    render(<AppError error={error} reset={mockReset} />)
    fireEvent.click(screen.getByText('errorScreen.retry'))
    expect(mockReset).toHaveBeenCalledTimes(1)
  })
})


describe('AuthError', () => {
  const mockReset = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    { name: 'renders generic error message in non-development env', error: new Error('Auth failed') as Error & { digest?: string } },
    { name: 'falls back to generic error key when message is empty', error: new Error('') as Error & { digest?: string } },
    { name: 'handles error with digest property', error: Object.assign(new Error('Session expired'), { digest: 'xyz789' }) },
  ])('$name', ({ error }) => {
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

  it('reports the failure while keeping raw details out of the message', () => {
    const error = new Error('Internal authentication detail')
    render(<AuthError error={error} reset={mockReset} />)
    expect(captureException).toHaveBeenCalledExactlyOnceWith(error)
    expect(screen.getByText('auth.genericError')).toBeInTheDocument()
    expect(screen.queryByText(error.message)).not.toBeInTheDocument()
  })
})


describe('GlobalError', () => {
  const mockReset = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the generic error message through i18n', () => {
    const error = new Error('Boom') as Error & { digest?: string }
    render(<GlobalError error={error} reset={mockReset} />)
    expect(screen.getByText('errorScreen.title')).toBeInTheDocument()
  })

  it('renders the retry button label through i18n', () => {
    const error = new Error('Boom') as Error & { digest?: string }
    render(<GlobalError error={error} reset={mockReset} />)
    expect(screen.getByText('errorScreen.retry')).toBeInTheDocument()
  })

  it('calls reset when retry button is clicked', () => {
    const error = new Error('Boom') as Error & { digest?: string }
    render(<GlobalError error={error} reset={mockReset} />)
    fireEvent.click(screen.getByText('errorScreen.retry'))
    expect(mockReset).toHaveBeenCalledTimes(1)
  })

  it('handles error with digest property', () => {
    const error = Object.assign(new Error('Server error'), { digest: 'abc123' })
    render(<GlobalError error={error} reset={mockReset} />)
    expect(screen.getByText('errorScreen.title')).toBeInTheDocument()
  })
})
