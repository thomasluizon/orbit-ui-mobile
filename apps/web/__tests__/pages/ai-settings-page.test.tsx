import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const push = vi.fn()
const patchProfile = vi.fn()
const updateAiSummary = vi.fn()
const updateProactiveAstra = vi.fn()

const mocks = vi.hoisted(() => ({
  profile: {
    hasProAccess: true,
    aiSummaryEnabled: false,
    proactiveAstraEnabled: false,
  } as Record<string, unknown>,
}))

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: mocks.profile, patchProfile }),
}))
vi.mock('@/hooks/use-go-back-or-fallback', () => ({ useGoBackOrFallback: () => vi.fn() }))
vi.mock('@/app/actions/profile', () => ({
  updateAiSummary: (...args: unknown[]) => updateAiSummary(...args),
  updateProactiveAstra: (...args: unknown[]) => updateProactiveAstra(...args),
}))
vi.mock('@/components/ui/app-bar', () => ({ AppBar: () => <div data-testid="app-bar" /> }))
vi.mock('@/app/(app)/ai-settings/_components/ai-feature-toggles', () => ({
  AiFeatureToggles: ({
    onToggleSummary,
    onToggleProactive,
    onUpgrade,
  }: {
    onToggleSummary: () => void
    onToggleProactive: () => void
    onUpgrade: () => void
  }) => (
    <div data-testid="feature-toggles">
      <button type="button" aria-label="toggle-summary" onClick={onToggleSummary} />
      <button type="button" aria-label="toggle-proactive" onClick={onToggleProactive} />
      <button type="button" aria-label="upgrade" onClick={onUpgrade} />
    </div>
  ),
}))

import AiSettingsPage from '@/app/(app)/ai-settings/page'

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <AiSettingsPage />
    </QueryClientProvider>,
  )
}

describe('AiSettingsPage', () => {
  beforeEach(() => {
    push.mockClear()
    patchProfile.mockReset()
    updateAiSummary.mockReset()
    updateProactiveAstra.mockReset()
    mocks.profile = {
      hasProAccess: true,
      aiSummaryEnabled: false,
      proactiveAstraEnabled: false,
    }
  })

  it('renders only the surviving settings controls and no retired list section', () => {
    renderPage()
    expect(screen.getByRole('button', { name: 'toggle-summary' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'toggle-proactive' })).toBeInTheDocument()
    expect(screen.getByTestId('feature-toggles').children).toHaveLength(3)
  })

  it('optimistically enables the daily summary', async () => {
    updateAiSummary.mockResolvedValue(undefined)
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'toggle-summary' }))
    expect(patchProfile).toHaveBeenCalledWith({ aiSummaryEnabled: true })
    await waitFor(() => expect(updateAiSummary).toHaveBeenCalledWith({ enabled: true }))
  })

  it('routes free users to upgrade from a locked surviving row', () => {
    mocks.profile = {
      hasProAccess: false,
      aiSummaryEnabled: false,
      proactiveAstraEnabled: false,
    }
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'upgrade' }))
    expect(push).toHaveBeenCalledWith('/upgrade')
  })
})
