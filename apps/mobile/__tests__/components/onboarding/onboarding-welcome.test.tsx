import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  getOnboardingDisplayStep,
  getOnboardingDisplayTotal,
  ONBOARDING_TOTAL_STEPS,
  ONBOARDING_STARTERS,
} from '@orbit/shared/utils'
import { OnboardingWelcome } from '@/components/onboarding/onboarding-welcome'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))

vi.mock('@/components/ui/input', () => ({
  Input: (props: Record<string, unknown>) => React.createElement('Input', props),
}))
vi.mock('@/components/ui/chip', () => ({
  Chip: ({ children, onPress }: { children: React.ReactNode; onPress: () => void }) =>
    React.createElement('Chip', { onPress }, children),
}))

const TestRenderer = require('react-test-renderer')

describe('OnboardingWelcome helpers', () => {
  it('exposes the sentence starters', () => {
    expect(ONBOARDING_STARTERS).toEqual(['water', 'walk', 'read', 'tidy'])
  })

  it('uses the same three-step display for every account', () => {
    expect(getOnboardingDisplayTotal()).toBe(ONBOARDING_TOTAL_STEPS)
  })

  it('maps the zero-based flow index to the displayed position', () => {
    expect(getOnboardingDisplayStep(0)).toBe(1)
    expect(getOnboardingDisplayStep(ONBOARDING_TOTAL_STEPS - 1)).toBe(
      ONBOARDING_TOTAL_STEPS,
    )
  })
})

describe('OnboardingWelcome', () => {
  it('renders the what prompt and its four starters', () => {
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<OnboardingWelcome sentence="" marks={[]} onChange={vi.fn()} />)
    })
    const renderedText = tree.root
      .findAll((node: { type: unknown }) => node.type === 'Text')
      .map((node: { props: { children?: unknown } }) => node.props.children)
    expect(renderedText).toContain('onboarding.flow.what.title')
    expect(tree.root.findAll((node: { type: unknown }) => node.type === 'Chip')).toHaveLength(4)
    expect(tree.root.findByType('Input').props.marksLabel).toBe('onboarding.flow.what.marksLabel')
  })
})
