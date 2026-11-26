import { createApiClientError } from '@orbit/shared/utils'
import { afterAll, beforeAll, describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { expectSmallSheetActions, sheetSlotButtons } from '@/__tests__/support/sheet-slots'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('dompurify', () => ({
  default: { sanitize: (html: string) => html },
}))

const mockMutateAsync = vi.fn()
const mockShowError = vi.fn()
vi.mock('@/hooks/use-goals', () => ({
  useUpdateGoal: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
    error: null,
  }),
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({
    showError: mockShowError,
  }),
}))

vi.mock('@/components/ui/date-field', () => ({
  DateField: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input data-testid="date-picker" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}))

import { EditGoalModal } from '@/components/goals/edit-goal-modal'
import type { Goal } from '@orbit/shared/types/goal'

const mockGoal: Goal = {
  id: 'g1',
  title: 'Run 100km',
  description: null,
  targetValue: 100,
  currentValue: 45,
  unit: 'km',
  deadline: '2025-12-31',
  status: 'Active',
  progressPercentage: 45,
  createdAtUtc: '2025-01-01T00:00:00Z',
  completedAtUtc: null,
  position: 0,
  linkedHabits: [],
}

beforeEach(() => {
  mockMutateAsync.mockReset()
  mockShowError.mockReset()
})

describe('EditGoalModal', () => {

  it('renders nothing when closed', () => {
    const { container } = render(
      <EditGoalModal open={false} onOpenChange={vi.fn()} goal={mockGoal} />,
    )
    expect(container.innerHTML).toBe('')
  })
})
