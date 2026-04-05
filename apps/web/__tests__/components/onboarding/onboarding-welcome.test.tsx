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
  it('renders welcome title and subtitle', () => {
    render(<OnboardingWelcome />, { wrapper: createWrapper() })
    expect(screen.getByText('onboarding.flow.welcome.title')).toBeInTheDocument()
    expect(screen.getByText('onboarding.flow.welcome.subtitle')).toBeInTheDocument()
  })

  it('renders week start day buttons', () => {
    render(<OnboardingWelcome />, { wrapper: createWrapper() })
    expect(screen.getByText('settings.weekStartDay.monday')).toBeInTheDocument()
    expect(screen.getByText('settings.weekStartDay.sunday')).toBeInTheDocument()
  })

  it('renders the Orbit logo', () => {
    render(<OnboardingWelcome />, { wrapper: createWrapper() })
    expect(screen.getByAltText('Orbit')).toBeInTheDocument()
  })

  it('does not show color scheme for non-pro users', () => {
    render(<OnboardingWelcome />, { wrapper: createWrapper() })
    expect(screen.queryByText('onboarding.flow.welcome.colorScheme')).not.toBeInTheDocument()
  })
})
