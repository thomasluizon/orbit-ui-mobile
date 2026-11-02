import { expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { getReferralLevelMilestone } from '@orbit/shared/stores'
import { useEngagementPromptStore } from '@/stores/referral-prompt-store'

const imports = vi.hoisted(() => ({ referral: vi.fn(), milestone: vi.fn(), consent: vi.fn() }))

vi.mock('@/components/referral/referral-prompt', () => {
  imports.referral()
  return { ReferralPrompt: () => <p>Referral prompt</p> }
})
vi.mock('@/components/milestone-share/milestone-share-prompt', () => {
  imports.milestone()
  return { MilestoneSharePrompt: () => <p>Milestone prompt</p> }
})
vi.mock('@/components/marketing-consent/marketing-consent-prompt', () => {
  imports.consent()
  return { MarketingConsentPrompt: () => <p>Consent prompt</p> }
})

it('imports the app layout without loading inactive engagement prompts', async () => {
  await import('@/app/(app)/layout')
  expect(imports.referral).not.toHaveBeenCalled()
  expect(imports.milestone).not.toHaveBeenCalled()
  expect(imports.consent).not.toHaveBeenCalled()
})

it('loads queued prompts on demand and keeps their owners mounted while the queue clears', async () => {
  const { DeferredEngagementPrompts } = await import('@/components/engagement/deferred-engagement-prompts')
  useEngagementPromptStore.setState(useEngagementPromptStore.getInitialState())
  render(<DeferredEngagementPrompts />)
  expect(imports.referral).not.toHaveBeenCalled()
  act(() => useEngagementPromptStore.getState().armReferralPrompt(getReferralLevelMilestone(5)))
  expect(await screen.findByText('Referral prompt')).toBeVisible()
  expect(screen.getByText('Milestone prompt')).toBeVisible()
  expect(screen.getByText('Consent prompt')).toBeVisible()
  await act(() => useEngagementPromptStore.setState({ armedPrompt: null }))
  expect(screen.getByText('Referral prompt')).toBeVisible()
  expect(imports.referral).toHaveBeenCalledOnce()
  expect(imports.milestone).toHaveBeenCalledOnce()
  expect(imports.consent).toHaveBeenCalledOnce()
})
