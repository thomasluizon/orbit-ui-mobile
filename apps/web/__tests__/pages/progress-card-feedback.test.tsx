import type { ReactNode } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { createMockGoal } from '@orbit/shared/__tests__/factories'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { MOTION_SAFE } from '@/__tests__/support/compiled-class-rules'
import { compilePressScaleRules, scaledWhilePressed, type PressScaleRule } from '@/__tests__/support/press-scale-rules'

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: ReactNode }) => children,
  closestCenter: vi.fn(),
}))

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: ReactNode }) => children,
  useSortable: () => ({
    attributes: {},
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
vi.mock('next/navigation', () => ({ usePathname: () => '/progress', useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/use-notification-inbox', () => ({ useNotificationInbox: () => ({ visibleUnreadCount: 0 }) }))
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
  useCreateGoal: vi.fn(),
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
vi.mock('@/hooks/use-is-desktop', () => ({ useIsDesktop: () => false, useIsWideDesktop: () => false }))

import { ProgressContent } from '@/app/(app)/progress/_components/progress-content'

async function renderGoalCard() {
  await act(async () => {
    render(<ProgressContent screen="goals" />)
    await Promise.resolve()
  })
  return screen.getByRole('button', { name: (accessibleName) => accessibleName.includes('Read 12 Books') })
}

describe('goal card interaction feedback', () => {
  afterEach(cleanup)

  it('keeps sortable translation exact while applying drag scale', async () => {
    const card = await renderGoalCard()
    const surface = card.querySelector(':scope > [data-slot="goal-card-surface"]')

    expect(card.style.translate).toBe('100px 40px')
    expect(card.style.transform).toBe('scaleX(0.8) scaleY(1.4)')
    expect(card.style.transform).not.toContain('translate')
    expect(card.style.transition, 'the press target neither paints nor scales, so it transitions nothing').toBe('')
    expect(card).toHaveAttribute('data-dragging', 'true')
    expect(card).toHaveClass('group/goal-card', 'data-[dragging=true]:opacity-50', 'data-[dragging=true]:z-[2]')
    expect(surface).toHaveClass(
      '[transition-property:background-color,box-shadow,scale]',
      '[transition-duration:var(--dur-hover),var(--dur-hover),var(--dur-press)]',
      '[transition-timing-function:var(--ease-standard),var(--ease-standard),var(--ease-out)]',
      'group-hover/goal-card:shadow-[inset_0_0_0_1px_var(--hairline-strong)]',
      'motion-safe:group-active/goal-card:scale-[0.96]',
      'motion-safe:group-data-[dragging=true]/goal-card:scale-[0.96]',
    )
    expect(card.className).not.toContain('animate-')
  })
})

describe('goal card press scale', () => {
  let rules: PressScaleRule[]
  beforeAll(async () => { rules = await compilePressScaleRules() })
  afterEach(cleanup)

  it('scales the card surface on press and never the press target, so a press at its edge keeps its click', async () => {
    const card = await renderGoalCard()
    const scaled = scaledWhilePressed(rules, card)
    expect(scaled.map(({ element }) => element), 'the pressed card scales only its surface').toEqual([card.querySelector(':scope > [data-slot="goal-card-surface"]')])
    expect(scaled.map(({ media }) => media), 'reduced motion removes the press scale').toEqual([[MOTION_SAFE]])
  })
})
