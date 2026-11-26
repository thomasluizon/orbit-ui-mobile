import { afterAll, afterEach, beforeAll, describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { expectSmallSheetActions, sheetSlotButtons } from '@/__tests__/support/sheet-slots'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('dompurify', () => ({
  default: { sanitize: (html: string) => html },
}))

vi.mock('@/hooks/use-habit-queries', () => ({ useHabits: () => ({ data: { habitsById: new Map() }, isLoading: false, isError: false, refetch: vi.fn() }) }))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { weekStartDay: 0 } }),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))

const mockMutateAsync = vi.fn().mockResolvedValue({})
const mockShowError = vi.fn()

vi.mock('@/hooks/use-goals', () => ({
  useCreateGoal: () => ({
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

vi.mock('@orbit/shared/utils/dates', () => ({
  formatAPIDate: () => '2025-06-15',
}))

import { CreateGoalSheet } from '@/components/goals/create-goal-sheet'
import {
  holdAccount,
  recoverSameAccount,
  replaceAccountWith,
} from '@/__tests__/support/account-change'

describe('CreateGoalSheet', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    mockMutateAsync.mockClear()
    mockShowError.mockClear()
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <CreateGoalSheet open={false} onClose={vi.fn()} />,
    )
    expect(container.innerHTML).toBe('')
  })

  function fillStandardGoal() {
    fireEvent.change(screen.getByLabelText(/goals.form.title/), {
      target: { value: 'Read more books' },
    })
    fireEvent.change(screen.getByLabelText('goals.form.targetValueQuestion'), { target: { value: '12' } })
    fireEvent.change(screen.getByLabelText('goals.form.unitQuestion'), { target: { value: 'books' } })
  }
})
