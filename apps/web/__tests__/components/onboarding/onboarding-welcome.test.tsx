import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({
    profile: { weekStartDay: 1 },
  }),
  useHasProAccess: () => false,
}))

vi.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => ({
    currentScheme: 'violet',
    applyScheme: vi.fn(),
  }),
}))

vi.mock('@/app/actions/profile', () => ({
  updateWeekStartDay: vi.fn().mockResolvedValue(undefined),
  updateColorScheme: vi.fn().mockResolvedValue(undefined),
}))

import { OnboardingWelcome } from '@/components/onboarding/onboarding-welcome'

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

describe('OnboardingWelcome', () => {
  it('renders welcome title heading', () => {
    render(<OnboardingWelcome />, { wrapper: createWrapper() })
    expect(screen.getByText('onboarding.flow.welcome.title')).toBeInTheDocument()
  })

  it('renders the week start day section label', () => {
    render(<OnboardingWelcome />, { wrapper: createWrapper() })
    expect(screen.getByText('onboarding.flow.welcome.weekStart')).toBeInTheDocument()
  })

  it('exposes monday and sunday selectors via aria-label', () => {
    render(<OnboardingWelcome />, { wrapper: createWrapper() })
    expect(screen.getByLabelText('settings.weekStartDay.monday')).toBeInTheDocument()
    expect(screen.getByLabelText('settings.weekStartDay.sunday')).toBeInTheDocument()
  })

  it('does not show color scheme for non-pro users', () => {
    render(<OnboardingWelcome />, { wrapper: createWrapper() })
    expect(screen.queryByText('onboarding.flow.welcome.colorScheme')).not.toBeInTheDocument()
  })
})
