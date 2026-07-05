import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import {
  TEMPLATE_PACKS,
  templatePackHabitTitleKey,
  templatePackNameKey,
} from '@orbit/shared/utils'
import {
  OnboardingActionsProvider,
  type OnboardingActions,
} from '@/components/onboarding/onboarding-actions-context'

const createHabit = vi.fn().mockResolvedValue({ id: '0', title: 'x' })
const onCreated = vi.fn()
const onCreateOwn = vi.fn()
const onSkip = vi.fn()

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}(${JSON.stringify(params)})` : key,
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showError: vi.fn() }),
}))

import { OnboardingTemplatePacks } from '@/components/onboarding/onboarding-template-packs'

const stubActions: OnboardingActions = {
  createHabit,
  logHabit: vi.fn().mockResolvedValue(undefined),
  createGoal: vi.fn().mockResolvedValue(undefined),
  setWeekStartDay: vi.fn().mockResolvedValue(undefined),
  setColorScheme: vi.fn().mockResolvedValue(undefined),
  finishOnboarding: vi.fn().mockResolvedValue(undefined),
}

function renderPicker() {
  return render(
    <OnboardingActionsProvider actions={stubActions} hasProAccess={false} isLive={false}>
      <OnboardingTemplatePacks onCreated={onCreated} onCreateOwn={onCreateOwn} onSkip={onSkip} />
    </OnboardingActionsProvider>,
  )
}

describe('OnboardingTemplatePacks', () => {
  beforeEach(() => {
    createHabit.mockClear()
    onCreated.mockClear()
    onCreateOwn.mockClear()
    onSkip.mockClear()
  })

  it('lists all four packs', () => {
    renderPicker()
    for (const pack of TEMPLATE_PACKS) {
      expect(screen.getByText(templatePackNameKey(pack.id))).toBeTruthy()
    }
  })

  it('invokes onCreateOwn from the pack grid', () => {
    renderPicker()
    fireEvent.click(screen.getByText('onboarding.flow.templatePacks.createOwn'))
    expect(onCreateOwn).toHaveBeenCalledTimes(1)
  })

  it('selects a pack, drops a toggled-off habit, and creates the rest through the action surface', async () => {
    const pack = TEMPLATE_PACKS[0]
    if (!pack) throw new Error('expected a template pack')
    const firstHabit = pack.habits[0]
    const secondHabit = pack.habits[1]
    if (!firstHabit || !secondHabit) throw new Error('expected pack habits')

    renderPicker()
    fireEvent.click(screen.getByText(templatePackNameKey(pack.id)))
    fireEvent.click(screen.getByText(templatePackHabitTitleKey(pack.id, firstHabit.key)))
    fireEvent.click(screen.getByRole('button', { name: /createCta/ }))

    await waitFor(() =>
      expect(createHabit).toHaveBeenCalledTimes(pack.habits.length - 1),
    )

    const createdTitles = createHabit.mock.calls.map((call) => (call[0] as { title: string }).title)
    expect(createdTitles).not.toContain(templatePackHabitTitleKey(pack.id, firstHabit.key))

    const secondItem = createHabit.mock.calls
      .map((call) => call[0] as { title: string; emoji: string; isGeneral: boolean })
      .find((item) => item.title === templatePackHabitTitleKey(pack.id, secondHabit.key))
    expect(secondItem?.emoji).toBe(secondHabit.emoji)
    expect(secondItem?.isGeneral).toBe(false)

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
  })
})
