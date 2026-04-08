import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { Text, TouchableOpacity } from 'react-native'

const mockReplace = vi.fn()
const mockSetQueryData = vi.fn()
const mockCancelQueries = vi.fn()
const mockInvalidateQueries = vi.fn()
const mockCompleteOnboarding = vi.fn().mockResolvedValue({})

vi.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    setQueryData: mockSetQueryData,
    cancelQueries: mockCancelQueries,
    invalidateQueries: mockInvalidateQueries,
  }),
}))

vi.mock('@orbit/shared/query', () => ({
  profileKeys: {
    all: ['profile'],
    detail: () => ['profile-detail'],
  },
}))

vi.mock('@/hooks/use-profile', () => ({
  useHasProAccess: () => false,
}))

vi.mock('@/lib/queued-api-mutation', () => ({
  performQueuedApiMutation: mockCompleteOnboarding,
}))

vi.mock('@/components/onboarding/onboarding-welcome', () => ({
  OnboardingWelcome: () => <Text>step-welcome</Text>,
}))

vi.mock('@/components/onboarding/onboarding-create-habit', () => ({
  OnboardingCreateHabit: ({
    onCreated,
  }: {
    onCreated: (habitId: string, title: string) => void
  }) => (
    <TouchableOpacity onPress={() => onCreated('habit-1', 'Test Habit')}>
      <Text>step-create-habit</Text>
    </TouchableOpacity>
  ),
}))

vi.mock('@/components/onboarding/onboarding-complete-habit', () => ({
  OnboardingCompleteHabit: ({
    onCompleted,
  }: {
    onCompleted: () => void
  }) => (
    <TouchableOpacity onPress={onCompleted}>
      <Text>step-complete-habit</Text>
    </TouchableOpacity>
  ),
}))

vi.mock('@/components/onboarding/onboarding-create-goal', () => ({
  OnboardingCreateGoal: ({
    onCreated,
    onSkip,
  }: {
    onCreated: () => void
    onSkip: () => void
  }) => (
    <TouchableOpacity onPress={onCreated}>
      <Text>step-create-goal</Text>
      <Text onPress={onSkip}>skip-goal</Text>
    </TouchableOpacity>
  ),
}))

vi.mock('@/components/onboarding/onboarding-features', () => ({
  OnboardingFeatures: () => <Text>step-features</Text>,
}))

vi.mock('@/components/onboarding/onboarding-complete', () => ({
  OnboardingComplete: ({
    onFinish,
  }: {
    onFinish: () => void
  }) => (
    <TouchableOpacity onPress={onFinish}>
      <Text>step-complete</Text>
    </TouchableOpacity>
  ),
}))

import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'

describe('OnboardingFlow', () => {
  beforeEach(() => {
    mockReplace.mockClear()
    mockSetQueryData.mockClear()
    mockCancelQueries.mockClear()
    mockInvalidateQueries.mockClear()
    mockCompleteOnboarding.mockClear()
  })

  it('renders the first step and the footer actions', () => {
    render(<OnboardingFlow />)

    expect(screen.getByText('step-welcome')).toBeTruthy()
    expect(screen.getByText('onboarding.flow.skip')).toBeTruthy()
    expect(screen.getByText('onboarding.flow.next')).toBeTruthy()
  })

  it('advances through the free-user flow without the goal step', () => {
    render(<OnboardingFlow />)

    fireEvent.press(screen.getByText('onboarding.flow.next'))
    expect(screen.getByText('step-create-habit')).toBeTruthy()

    fireEvent.press(screen.getByText('step-create-habit'))
    expect(screen.getByText('step-complete-habit')).toBeTruthy()

    fireEvent.press(screen.getByText('step-complete-habit'))
    expect(screen.getByText('step-features')).toBeTruthy()
  })

  it('skips directly to the final step', () => {
    render(<OnboardingFlow />)

    fireEvent.press(screen.getByText('onboarding.flow.skip'))
    expect(screen.getByText('step-complete')).toBeTruthy()
  })
})
