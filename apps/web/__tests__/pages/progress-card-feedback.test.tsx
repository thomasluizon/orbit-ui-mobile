import type { ReactNode } from 'react'
import { act, render, screen } from '@testing-library/react'
import { createMockGoal } from '@orbit/shared/__tests__/factories'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: ReactNode }) => children,
  closestCenter: vi.fn(),
}))

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: ReactNode }) => children,
  useSortable: () => ({
    isDragging: true,
    listeners: {},
    setNodeRef: vi.fn(),
    transform: { x: 100, y: 40, scaleX: 0.8, scaleY: 1.4 },
  }),
  verticalListSortingStrategy: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/app/(app)/progress/_components/use-goal-drag', () => ({
  useGoalDrag: () => ({ sensors: [], onDragEnd: vi.fn() }),
}))
vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({
    profile: {
      canViewGamification: false,
      currentStreak: 0,
      longestStreak: 0,
      timeZone: 'America/Sao_Paulo',
      totalXp: 0,
    },
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  }),
}))
vi.mock('@/hooks/use-goals', () => ({
  useGoals: () => ({
    data: { allGoals: [createMockGoal()] },
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  }),
  useReorderGoals: () => ({ isError: false, isPending: false, mutate: vi.fn() }),
}))
vi.mock('@/hooks/use-gamification', () => ({
  useGamificationProfile: () => ({
    error: null,
    isError: false,
    isLoading: false,
    profile: null,
    refetch: vi.fn(),
    xpProgress: 0,
  }),
  useRepairStreak: () => ({ error: null, isError: false, isPending: false, mutate: vi.fn() }),
  useStreakFreeze: () => ({
    daysUntilNextFreeze: 0,
    freezesAvailable: 0,
    freezesUsedThisMonth: 0,
    isFrozenToday: false,
    maxStreakFreezesAccumulated: 3,
    streakFreezesAccumulated: 0,
    streakInfo: null,
    streakQuery: { isError: false, refetch: vi.fn() },
  }),
}))
vi.mock('@/hooks/use-retrospective', () => ({
  useProgressRetrospective: () => ({
    data: null,
    error: null,
    isError: false,
    isLoading: true,
    refetch: vi.fn(),
  }),
}))
vi.mock('@/hooks/use-is-desktop', () => ({ useIsDesktop: () => false }))

import { ProgressContent } from '@/app/(app)/progress/_components/progress-content'

describe('goal card interaction feedback', () => {
  it('keeps sortable translation exact while applying drag scale', async () => {
    await act(async () => {
      render(<ProgressContent />)
      await Promise.resolve()
    })
    const card = screen.getByRole('button', { name: (accessibleName) => accessibleName.includes('Read 12 Books') })

    expect(card.style.translate).toBe('100px 40px')
    expect(card.style.transform).toBe('scaleX(0.8) scaleY(1.4)')
    expect(card.style.transform).not.toContain('translate')
    expect(card.style.transition).toBe(
      'background-color 380ms var(--ease-standard), box-shadow 380ms var(--ease-standard), scale 150ms var(--ease-out)',
    )
    expect(card).toHaveAttribute('data-dragging', 'true')
    expect(card).toHaveClass(
      'hover:shadow-[inset_0_0_0_1px_var(--hairline-strong)]',
      'active:scale-[0.96]',
      'data-[dragging=true]:scale-[0.96]',
      'data-[dragging=true]:opacity-50',
      'data-[dragging=true]:z-[2]',
    )
    expect(card.className).not.toContain('animate-')
  })
})
