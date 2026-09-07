import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGoalProgressFormState } from '@/components/goals/goal-detail-drawer/use-goal-progress-form-state'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  isPending: false,
  showError: vi.fn(),
  showInterstitialIfDue: vi.fn(),
}))

vi.mock('@/hooks/use-goals', () => ({
  useUpdateGoalProgress: () => ({ mutateAsync: mocks.mutateAsync, isPending: mocks.isPending }),
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showError: mocks.showError }),
}))

vi.mock('@/hooks/use-ad-mob', () => ({
  useAdMob: () => ({ showInterstitialIfDue: mocks.showInterstitialIfDue }),
}))

type FormApi = ReturnType<typeof useGoalProgressFormState>

interface RenderInput {
  open?: boolean
  goalId?: string
  goalCurrentValue?: number
  goalTargetValue?: number
  refetchDetail?: () => Promise<unknown>
  onClose?: () => void
}

function renderForm(input: RenderInput = {}) {
  const ref: { current: FormApi | null } = { current: null }

  function Harness() {
    ref.current = useGoalProgressFormState({
      open: input.open ?? true,
      goalId: input.goalId ?? 'goal-1',
      goalCurrentValue: input.goalCurrentValue,
      goalTargetValue: input.goalTargetValue,
      refetchDetail: input.refetchDetail ?? (async () => undefined),
      onClose: input.onClose ?? vi.fn(),
    })
    return null
  }

  TestRenderer.act(() => {
    TestRenderer.create(React.createElement(Harness))
  })

  if (!ref.current) throw new Error('useGoalProgressFormState did not render')
  return ref as { current: FormApi }
}

async function act(action: () => void | Promise<void>) {
  await TestRenderer.act(async () => {
    await action()
  })
}

describe('mobile useGoalProgressFormState', () => {
  beforeEach(() => {
    mocks.mutateAsync.mockReset().mockResolvedValue(undefined)
    mocks.isPending = false
    mocks.showError.mockReset()
    mocks.showInterstitialIfDue.mockReset().mockResolvedValue(undefined)
  })

  it('seeds the progress value from the current goal value on open', () => {
    const form = renderForm({ goalCurrentValue: 3 })
    expect(form.current.progressValue).toBe('3')
    expect(form.current.showProgressForm).toBe(false)
    expect(form.current.isProgressDirty).toBe(false)
  })

  it('flags the entry as dirty once the value changes inside an open form', async () => {
    const form = renderForm({ goalCurrentValue: 3 })

    await act(() => form.current.openProgressForm())
    expect(form.current.showProgressForm).toBe(true)
    expect(form.current.isProgressDirty).toBe(false)

    await act(() => form.current.setProgressValue('7'))
    expect(form.current.isProgressDirty).toBe(true)
  })

  it('detects when the entered value exceeds the target', async () => {
    const form = renderForm({ goalCurrentValue: 0, goalTargetValue: 10 })

    await act(() => form.current.setProgressValue('15'))
    expect(form.current.progressExceedsTarget).toBe(true)

    await act(() => form.current.setProgressValue('4'))
    expect(form.current.progressExceedsTarget).toBe(false)
  })

  it('submits the progress mutation, refetches, shows an ad, and resets the form', async () => {
    const refetchDetail = vi.fn().mockResolvedValue(undefined)
    const form = renderForm({ goalCurrentValue: 0, refetchDetail })

    await act(() => form.current.openProgressForm())
    await act(() => form.current.setProgressValue('5'))
    await act(() => form.current.setProgressNote('  felt great  '))
    await act(() => form.current.submitProgress())

    expect(mocks.mutateAsync).toHaveBeenCalledWith({
      goalId: 'goal-1',
      data: { currentValue: 5, note: 'felt great' },
    })
    expect(refetchDetail).toHaveBeenCalledTimes(1)
    expect(mocks.showInterstitialIfDue).toHaveBeenCalledTimes(1)
    expect(form.current.showProgressForm).toBe(false)
    expect(form.current.progressValue).toBe('')
  })

  it('rejects an empty submission with a validation toast and no mutation', async () => {
    const form = renderForm({ goalCurrentValue: undefined })

    await act(() => form.current.submitProgress())

    expect(mocks.showError).toHaveBeenCalledWith('goals.form.progressValueInvalid')
    expect(mocks.mutateAsync).not.toHaveBeenCalled()
  })

  it('surfaces a friendly error when the progress mutation fails', async () => {
    mocks.mutateAsync.mockRejectedValue(new Error('network down'))
    const form = renderForm({ goalCurrentValue: 0 })

    await act(() => form.current.setProgressValue('9'))
    await act(() => form.current.submitProgress())

    expect(mocks.showError).toHaveBeenCalledWith('goals.errors.progress')
  })

  it('opens the discard dialog when dismissing a dirty form and confirms to the drawer', async () => {
    const onClose = vi.fn()
    const form = renderForm({ goalCurrentValue: 0, onClose })

    await act(() => form.current.openProgressForm())
    await act(() => form.current.setProgressValue('2'))
    await act(() => form.current.requestProgressDismiss('drawer'))

    expect(form.current.showProgressDiscardDialog).toBe(true)
    expect(onClose).not.toHaveBeenCalled()

    await act(() => form.current.confirmProgressDismiss())
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(form.current.showProgressDiscardDialog).toBe(false)
  })

  it('closes the drawer immediately when dismissing a clean form', async () => {
    const onClose = vi.fn()
    const form = renderForm({ goalCurrentValue: 3, onClose })

    await act(() => form.current.requestProgressDismiss('drawer'))

    expect(form.current.showProgressDiscardDialog).toBe(false)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('cancels the discard dialog without dismissing anything', async () => {
    const onClose = vi.fn()
    const form = renderForm({ goalCurrentValue: 0, onClose })

    await act(() => form.current.openProgressForm())
    await act(() => form.current.setProgressValue('8'))
    await act(() => form.current.requestProgressDismiss('form'))
    expect(form.current.showProgressDiscardDialog).toBe(true)

    await act(() => form.current.cancelProgressDismiss())
    expect(form.current.showProgressDiscardDialog).toBe(false)
    expect(onClose).not.toHaveBeenCalled()
  })
})
