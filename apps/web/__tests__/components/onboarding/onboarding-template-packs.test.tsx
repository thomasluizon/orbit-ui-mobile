import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  TEMPLATE_PACKS,
  templatePackHabitTitleKey,
  templatePackNameKey,
  templatePackTagKey,
} from '@orbit/shared/utils'

const mutate = vi.fn((_vars: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.())
const onCreated = vi.fn()
const onCreateOwn = vi.fn()
const onSkip = vi.fn()

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}(${JSON.stringify(params)})` : key,
}))

vi.mock('@/hooks/use-habits', () => ({
  useBulkCreateHabits: () => ({ mutate, isPending: false }),
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showError: vi.fn() }),
}))

import { OnboardingTemplatePacks } from '@/components/onboarding/onboarding-template-packs'

function renderPicker() {
  return render(
    <OnboardingTemplatePacks onCreated={onCreated} onCreateOwn={onCreateOwn} onSkip={onSkip} />,
  )
}

describe('OnboardingTemplatePacks', () => {
  beforeEach(() => {
    mutate.mockClear()
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

  it('selects a pack, drops a toggled-off habit, and bulk-creates the rest with tags', () => {
    const pack = TEMPLATE_PACKS[0]
    if (!pack) throw new Error('expected a template pack')
    const firstHabit = pack.habits[0]
    const secondHabit = pack.habits[1]
    if (!firstHabit || !secondHabit) throw new Error('expected pack habits')

    renderPicker()
    fireEvent.click(screen.getByText(templatePackNameKey(pack.id)))
    fireEvent.click(screen.getByText(templatePackHabitTitleKey(pack.id, firstHabit.key)))
    fireEvent.click(screen.getByRole('button', { name: /createCta/ }))

    expect(mutate).toHaveBeenCalledTimes(1)
    const call = mutate.mock.calls[0]
    if (!call) throw new Error('expected a bulk-create call')
    const payload = call[0] as {
      habits: Array<{ title: string; isGeneral: boolean; tags: string[]; emoji: string }>
    }
    expect(payload.habits).toHaveLength(pack.habits.length - 1)

    const titles = payload.habits.map((habit) => habit.title)
    expect(titles).not.toContain(templatePackHabitTitleKey(pack.id, firstHabit.key))
    expect(payload.habits.every((habit) => habit.isGeneral === false)).toBe(true)

    const secondItem = payload.habits.find(
      (habit) => habit.title === templatePackHabitTitleKey(pack.id, secondHabit.key),
    )
    expect(secondItem?.emoji).toBe(secondHabit.emoji)
    expect(secondItem?.tags).toEqual(secondHabit.tags.map((slug) => templatePackTagKey(slug)))

    expect(onCreated).toHaveBeenCalledTimes(1)
  })
})
