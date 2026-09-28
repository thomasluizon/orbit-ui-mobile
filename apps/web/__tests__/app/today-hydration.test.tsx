import { act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToString } from 'react-dom/server'
import { hydrateRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { profileKeys } from '@orbit/shared/query'
import { useEngagementSlot } from '@/hooks/use-engagement-slot'
import { TodayEngagementCards, TodayHabitsProgressHeader } from '@/app/(app)/today-sections'

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => ({
    syncSchemeFromProfile: vi.fn(),
    syncThemeFromProfile: vi.fn(),
    detectAndSaveSchemeIfNeeded: vi.fn(),
    detectAndSaveThemeIfNeeded: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-referral', () => ({
  useReferral: () => ({ stats: null, isLoading: true }),
}))

vi.mock('@/stores/ui-store', () => ({
  useUIStore: (selector: (state: { setupChecklistDismissed: boolean; setSetupChecklistDismissed: () => void }) => unknown) =>
    selector({ setupChecklistDismissed: false, setSetupChecklistDismissed: vi.fn() }),
}))

vi.mock('@/stores/referral-prompt-store', () => ({
  useEngagementPromptStore: (selector: (state: { homeEntryDismissed: boolean }) => unknown) =>
    selector({ homeEntryDismissed: false }),
}))

function TodayEngagementRegion() {
  const { slot } = useEngagementSlot({ isTodayView: true, isTodayDate: true })
  const exitTransition = { duration: 0 }
  return (
    <>
      <TodayEngagementCards
        engagementSlot={slot}
        exitTransition={exitTransition}
        onOpenReferral={() => {}}
        onDismissReferral={() => {}}
      />
      <TodayHabitsProgressHeader
        showDayProgress={false}
        dayProgress={{ done: 0, total: 0 }}
        engagementSlot={slot}
        exitTransition={exitTransition}
      />
    </>
  )
}

function Tree({ queryClient }: { queryClient: QueryClient }) {
  return (
    <QueryClientProvider client={queryClient}>
      <TodayEngagementRegion />
    </QueryClientProvider>
  )
}

describe('Today streamed hydration', () => {
  let root: Root | undefined

  afterEach(async () => {
    if (root) await act(async () => root?.unmount())
    root = undefined
    document.body.replaceChildren()
  })

  it('keeps the first Today render stable when profile data arrives before hydration', async () => {
    const serverQueryClient = new QueryClient()
    const serverHtml = renderToString(<Tree queryClient={serverQueryClient} />)
    serverQueryClient.clear()
    const container = document.createElement('div')
    container.innerHTML = serverHtml
    document.body.append(container)

    const clientQueryClient = new QueryClient()
    clientQueryClient.setQueryData(profileKeys.detail(), createMockProfile({
      isTrialActive: false,
      hasCompletedOnboardingChecklist: false,
    }))
    const recoverableError = vi.fn()
    await act(async () => {
      root = hydrateRoot(container, <Tree queryClient={clientQueryClient} />, {
        onRecoverableError: recoverableError,
      })
    })

    expect(serverHtml).toContain('referral.card.title')
    expect(serverHtml).not.toContain('today.setupChecklist.title')
    expect(recoverableError).not.toHaveBeenCalled()
    expect(container.querySelector('[data-testid="setup-checklist-card"]')).toBeInTheDocument()
    clientQueryClient.clear()
  })
})
