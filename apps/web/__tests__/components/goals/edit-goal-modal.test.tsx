import { createApiClientError } from '@orbit/shared/utils'
import { afterAll, beforeAll, describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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

vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

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

describe('EditGoalModal', () => {
  beforeEach(() => {
    mockMutateAsync.mockReset()
    mockShowError.mockReset()
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <EditGoalModal open={false} onOpenChange={vi.fn()} goal={mockGoal} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders form with goal data when open', () => {
    render(<EditGoalModal open={true} onOpenChange={vi.fn()} goal={mockGoal} />)
    expect(screen.getByDisplayValue('100')).toBeInTheDocument()
    expect(screen.getByDisplayValue('km')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Run 100km')).toBeInTheDocument()
    expect(screen.getByLabelText('goals.form.description')).not.toBeRequired()
    expect(screen.getByLabelText('goals.form.targetValue')).toBeRequired()
    expect(screen.getByLabelText('goals.form.unit')).toBeRequired()
  })

  it('shows validation error when target is 0', () => {
    render(<EditGoalModal open={true} onOpenChange={vi.fn()} goal={mockGoal} />)
    const targetInput = screen.getByLabelText('goals.form.targetValue')
    fireEvent.change(targetInput, { target: { value: '0' } })
    const form = targetInput.closest('form')
    fireEvent.submit(form!)
    expect(mockShowError).toHaveBeenCalledWith('goals.form.targetValueRequired')
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  it('shows validation error when unit is empty', () => {
    render(<EditGoalModal open={true} onOpenChange={vi.fn()} goal={mockGoal} />)
    const unitInput = screen.getByLabelText('goals.form.unit')
    fireEvent.change(unitInput, { target: { value: '' } })
    const form = unitInput.closest('form')
    fireEvent.submit(form!)
    expect(mockShowError).toHaveBeenCalledWith('goals.form.unitRequired')
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  it('links every inline error and focuses each first remaining invalid field', async () => {
    render(<EditGoalModal open={true} onOpenChange={vi.fn()} goal={mockGoal} />)
    const descriptionInput = screen.getByLabelText('goals.form.description')
    const targetInput = screen.getByLabelText('goals.form.targetValue')
    const unitInput = screen.getByLabelText('goals.form.unit')
    fireEvent.change(descriptionInput, { target: { value: '' } })
    fireEvent.change(targetInput, { target: { value: '' } })
    fireEvent.change(unitInput, { target: { value: '' } })

    fireEvent.submit(targetInput.closest('form')!)

    await waitFor(() => expect(targetInput).toHaveFocus())
    expect(mockShowError).toHaveBeenLastCalledWith('goals.form.targetValueRequired')
    expect(descriptionInput).not.toHaveAccessibleDescription()
    expect(targetInput).toHaveAccessibleDescription('goals.form.targetValueRequired')
    expect(unitInput).toHaveAccessibleDescription('goals.form.unitRequired')
    expect(descriptionInput).toHaveAttribute('aria-invalid', 'false')
    expect(targetInput).toHaveAttribute('aria-invalid', 'true')
    expect(unitInput).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryAllByRole('alert')).toHaveLength(0)

    fireEvent.change(targetInput, { target: { value: '10' } })
    fireEvent.submit(targetInput.closest('form')!)

    await waitFor(() => expect(unitInput).toHaveFocus())
    expect(descriptionInput).toHaveAttribute('aria-invalid', 'false')
    expect(targetInput).toHaveAttribute('aria-invalid', 'false')
    expect(unitInput).toHaveAccessibleDescription('goals.form.unitRequired')

    mockMutateAsync.mockResolvedValueOnce(undefined)
    fireEvent.change(unitInput, { target: { value: 'km' } })
    fireEvent.submit(targetInput.closest('form')!)
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledOnce())
  })

  it('pins Cancel and Save in the sheet footer and submits the form from there', async () => {
    mockMutateAsync.mockResolvedValue(undefined)
    render(<EditGoalModal open={true} onOpenChange={vi.fn()} goal={mockGoal} />)
    expect(sheetSlotButtons('sheet-actions')).toEqual(['common.cancel', 'common.save'])
    expectSmallSheetActions()
    expect(sheetSlotButtons('sheet-body')).not.toContain('common.save')
    expect(sheetSlotButtons('sheet-body')).not.toContain('common.cancel')
    const submit = screen.getByRole('button', { name: 'common.save' }) as HTMLButtonElement
    const form = screen.getByLabelText('goals.form.description').closest('form')!
    expect(submit).toHaveAttribute('form', form.id)
    expect(submit.form).toBe(form)

    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledOnce())
  })

  describe('native Enter submission', () => {
    let browserLaunch: BrowserLaunch | undefined
    let browser: Browser
    registerChromeLaunchHook(beforeAll, async (launch) => {
      browserLaunch = launch
      browser = await launch
    })
    afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

    it('submits once through the external footer pill when Enter is pressed in the description field', async () => {
      render(<EditGoalModal open onOpenChange={vi.fn()} goal={mockGoal} />)
      const markup = screen.getByRole('dialog').outerHTML
      const page = await browser.newPage()
      try {
        await page.setContent(markup)
        await page.evaluate(() => {
          const form = document.querySelector('form')!
          form.addEventListener('submit', (event) => {
            event.preventDefault()
            form.dataset.submitCount = String(Number(form.dataset.submitCount ?? 0) + 1)
            form.dataset.submitter = (event as SubmitEvent).submitter?.textContent ?? ''
          })
        })
        await page.locator('#edit-goal-description').press('Enter')
        expect(await page.locator('form').getAttribute('data-submit-count')).toBe('1')
        expect(await page.locator('form').getAttribute('data-submitter')).toBe('common.save')
      } finally {
        await page.close()
      }
    })
  })

  it('submits update request', async () => {
    mockMutateAsync.mockResolvedValue(undefined)
    const onOpenChange = vi.fn()
    render(<EditGoalModal open={true} onOpenChange={onOpenChange} goal={mockGoal} />)

    const form = screen.getByLabelText('goals.form.targetValue').closest('form')
    fireEvent.submit(form!)

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        goalId: 'g1',
        data: expect.objectContaining({
          title: 'Run 100km',
          targetValue: 100,
          unit: 'km',
        }),
      })
    })
  })
})


it('places legacy server validation beside each edited goal field and clears only an edited field', async () => {
  mockMutateAsync.mockRejectedValue(createApiClientError(400, { errors: { Title: ['Server title failure'], Unit: ['Server unit failure'] } }, 'Fallback'))
  render(<EditGoalModal open onOpenChange={vi.fn()} goal={mockGoal} />)
  const title = screen.getByLabelText('goals.form.description')
  const unit = screen.getByLabelText('goals.form.unit')
  fireEvent.submit(title.closest('form')!)
  await waitFor(() => expect(title).toHaveAccessibleDescription('Server title failure'))
  expect(unit).toHaveAccessibleDescription('Server unit failure')
  expect(screen.getByText('Server unit failure').style.color).toBe('var(--status-bad-text)')
  expect(title).toHaveFocus()
  expect(mockShowError).not.toHaveBeenCalled()
  fireEvent.change(title, { target: { value: 'Updated title' } })
  expect(title).not.toHaveAccessibleDescription('Server title failure')
  expect(unit).toHaveAccessibleDescription('Server unit failure')
})

it('focuses the mapped goal field while retaining general failures in a mixed response', async () => {
  mockMutateAsync.mockRejectedValue(createApiClientError(400, { errors: { Unit: ['Server unit failure'], HabitIds: ['Server linked habit failure'] } }, 'Fallback'))
  render(<EditGoalModal open onOpenChange={vi.fn()} goal={mockGoal} />)
  const unit = screen.getByLabelText('goals.form.unit')
  fireEvent.submit(unit.closest('form')!)
  await waitFor(() => expect(unit).toHaveAccessibleDescription('Server unit failure'))
  expect(unit).toHaveFocus()
  expect(mockShowError).toHaveBeenCalledWith(expect.stringContaining('Server linked habit failure'))
})
