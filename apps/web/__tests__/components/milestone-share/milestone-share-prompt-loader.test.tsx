import type { Ref } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MilestoneSharePromptLoader } from '@/components/milestone-share/milestone-share-prompt-loader'
import { CelebrationPanel } from '@/components/gamification/celebration-panel'
import { useEngagementPromptStore } from '@/stores/referral-prompt-store'
import { useAppToastStore } from '@/stores/app-toast-store'
import { useUIStore } from '@/stores/ui-store'
import { holdAccount, replaceAccountWith } from '@/__tests__/support/account-change'

vi.mock('next-intl', () => ({ useTranslations: () => translate, useLocale: () => 'en' }))
const translate = (key: string) => key
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => queryClient,
}))
const queryClient = { getQueryData: () => undefined }
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
vi.mock('@/hooks/use-share-card', () => ({ useShareCard: () => ({
  captureRef: { current: null }, isSharing: false, hasError: false, canShareFiles: false,
  share: vi.fn(), download: vi.fn(),
}) }))
vi.mock('@/components/milestone-share/milestone-share-card', () => ({
  MilestoneShareCard: ({ ref }: { ref?: Ref<HTMLDivElement> }) => <div ref={ref} data-testid="milestone-share-card" />,
}))

function delayPrompt() {
  let release!: () => void
  let finish!: () => void
  const pending = new Promise<void>((resolve) => { release = resolve })
  const completed = new Promise<void>((resolve) => { finish = resolve })
  const load = vi.fn(async () => {
    await pending
    const promptModule = await vi.importActual<typeof import('@/components/milestone-share/milestone-share-prompt')>(
      '@/components/milestone-share/milestone-share-prompt',
    )
    finish()
    return promptModule
  })
  vi.doMock('@/components/milestone-share/milestone-share-prompt', load)
  return { load, release: async () => { release(); await completed } }
}

async function arm() {
  await act(async () => { useEngagementPromptStore.getState().armMilestoneSharePrompt('share-streak-7') })
  expect(useEngagementPromptStore.getState().armedPrompt?.kind).toBe('milestone-share')
}

async function finishLoading(release: () => Promise<void>) {
  await act(async () => { await release(); await vi.dynamicImportSettled() })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('fetch', vi.fn())
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  holdAccount('user-1')
  useEngagementPromptStore.setState({ armedPrompt: null, promptedMilestoneKeys: [], lastPromptedAtIso: null })
  useUIStore.setState({ activeCelebration: null, queuedCelebrations: [], openOverlayIds: [] })
  useAppToastStore.getState().dismissAllToasts()
})

afterEach(() => {
  cleanup()
  vi.doUnmock('@/components/milestone-share/milestone-share-prompt')
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('loads no share presentation for absent or unrelated engagement prompts', async () => {
  const { load } = delayPrompt()
  render(<MilestoneSharePromptLoader />)
  await act(async () => { useEngagementPromptStore.getState().armReferralPrompt('level-3') })
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  expect(load).not.toHaveBeenCalled()
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(useUIStore.getState().openOverlayIds).toEqual([])
})

it('retains the real prompt through its consumed arm and closes through its existing sheet', async () => {
  const { load, release } = delayPrompt()
  const owner = render(<MilestoneSharePromptLoader />)
  await arm()
  await act(async () => { await vi.waitFor(() => expect(load).toHaveBeenCalledOnce()) })
  await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
  expect(useEngagementPromptStore.getState().promptedMilestoneKeys).toEqual([])
  expect(useUIStore.getState().openOverlayIds).toEqual([])
  await finishLoading(release)
  await act(async () => { await vi.advanceTimersByTimeAsync(499) })
  expect(screen.queryByRole('dialog')).toBeNull()
  await act(async () => { await vi.advanceTimersByTimeAsync(1) })
  expect(screen.getByTestId('milestone-share-card')).toBeInTheDocument()
  expect(useEngagementPromptStore.getState().armedPrompt).toBeNull()
  expect(useEngagementPromptStore.getState().promptedMilestoneKeys).toEqual(['share-streak-7'])
  owner.rerender(<MilestoneSharePromptLoader />)
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'milestoneShare.later' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(useUIStore.getState().openOverlayIds).toEqual([])
  expect(load).toHaveBeenCalledOnce()
})

it('leaves daily deadlines and queue handoff live while a share chunk is pending', async () => {
  const { release } = delayPrompt()
  useUIStore.getState().enqueueCelebration('daily-streak', { streak: 5 })
  const owner = render(<><CelebrationPanel /><MilestoneSharePromptLoader /></>)
  await arm()
  await act(async () => { await vi.advanceTimersByTimeAsync(2280) })
  expect(owner.container.querySelector('[data-daily-streak-moment]')).toHaveAttribute('data-phase', 'automatic-exit')
  await act(async () => { await vi.advanceTimersByTimeAsync(220) })
  expect(owner.container.querySelector('[data-daily-streak-moment]')).toBeNull()
  expect(useUIStore.getState().activeCelebration).toBeNull()
  await finishLoading(release)
  await act(async () => { await vi.advanceTimersByTimeAsync(500) })
  expect(screen.getByRole('dialog')).toBeInTheDocument()
})

it('contains a failed import, preserves eligibility and retries through the existing error surface', async () => {
  vi.doMock('@/components/milestone-share/milestone-share-prompt', () => { throw new Error('Chunk unavailable') })
  render(<MilestoneSharePromptLoader />)
  await arm()
  await act(async () => { await vi.dynamicImportSettled() })
  expect(useEngagementPromptStore.getState().promptedMilestoneKeys).toEqual([])
  expect(useUIStore.getState().openOverlayIds).toEqual([])
  expect(useAppToastStore.getState().currentToast?.toast).toMatchObject({
    kind: 'neutral', message: 'milestoneShare.shareError', actionLabel: 'common.retry',
  })
  const { release } = delayPrompt()
  act(() => useAppToastStore.getState().triggerAction())
  await finishLoading(release)
  await act(async () => { await vi.advanceTimersByTimeAsync(500) })
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(useAppToastStore.getState().currentToast).toBeNull()
})

it('discards pending imports across account replacement and A-to-B-to-A changes', async () => {
  const { release } = delayPrompt()
  render(<MilestoneSharePromptLoader />)
  await arm()
  await replaceAccountWith('user-2')
  await replaceAccountWith('user-1')
  await finishLoading(release)
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(useEngagementPromptStore.getState().promptedMilestoneKeys).toEqual([])
  expect(useAppToastStore.getState().currentToast).toBeNull()
  await arm()
  await act(async () => { await vi.dynamicImportSettled(); await vi.advanceTimersByTimeAsync(500) })
  expect(screen.getByRole('dialog')).toBeInTheDocument()
})

it('discards a pending import after unmount', async () => {
  const { release } = delayPrompt()
  const owner = render(<MilestoneSharePromptLoader />)
  await arm()
  owner.unmount()
  await finishLoading(release)
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(useEngagementPromptStore.getState().promptedMilestoneKeys).toEqual([])
  expect(useUIStore.getState().openOverlayIds).toEqual([])
})
