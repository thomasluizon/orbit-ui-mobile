import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import HabitDetailPage from '@/app/(app)/habits/[id]/page'

const mocks = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'habit-1' }),
  useSearchParams: () => mocks.searchParams,
}))

vi.mock('@/components/habits/habit-detail-screen', () => ({
  HabitDetailScreen: ({ date }: { date: string }) => <output data-testid="route-date">{date}</output>,
}))

describe('habit detail page route date', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 30, 12))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it.each([
    new URLSearchParams('date=bad'),
    new URLSearchParams('date=2026-08-28&date=2026-08-29'),
  ])('falls back before rendering malformed or repeated input', (searchParams) => {
    mocks.searchParams = searchParams

    render(<HabitDetailPage />)

    expect(screen.getByTestId('route-date')).toHaveTextContent('2026-08-30')
  })
})
