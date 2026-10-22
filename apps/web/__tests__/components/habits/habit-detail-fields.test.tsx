import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { HabitDetailFields } from '@/components/habits/habit-detail-fields'

vi.mock('@/components/goals/goal-detail-drawer', () => ({ GoalDetailDrawer: ({ goalId }: { goalId: string }) => <output aria-label="Goal">{goalId}</output> }))

describe.each(['en', 'pt-BR'])('habit read facts in %s', (locale) => {
  it('keeps schedule and end date read-only and opens linked goal details', () => {
    const messages = locale === 'en' ? en : ptBR
    render(<NextIntlClientProvider locale={locale} messages={messages}><HabitDetailFields habit={createMockHabit({ endDate: '2027-01-01', linkedGoals: [{ id: 'goal-1', title: 'Read books' }] })} summary="Every day" /></NextIntlClientProvider>)
    expect(screen.getByText('Every day')).toBeInTheDocument()
    expect(screen.getByText(messages.habits.form.endDate)).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Read books' }))
    expect(screen.getByLabelText('Goal')).toHaveTextContent('goal-1')
  })
})
