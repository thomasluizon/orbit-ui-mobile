import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const push = vi.fn()
const patchProfile = vi.fn()
const updateAiMemory = vi.fn()
const updateAiSummary = vi.fn()
const updateProactiveAstra = vi.fn()

const mocks = vi.hoisted(() => ({
  profile: { hasProAccess: true, aiMemoryEnabled: false, aiSummaryEnabled: false, proactiveAstraEnabled: false } as Record<string, unknown>,
  userFacts: {} as Record<string, unknown>,
}))

vi.mock('next-intl', () => ({ useTranslations: () => (key: string, params?: Record<string, unknown>) => (params ? `${key}(${JSON.stringify(params)})` : key) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: mocks.profile, patchProfile }) }))
vi.mock('@/hooks/use-go-back-or-fallback', () => ({ useGoBackOrFallback: () => vi.fn() }))
vi.mock('@/app/actions/profile', () => ({
  updateAiMemory: (...args: unknown[]) => updateAiMemory(...args),
  updateAiSummary: (...args: unknown[]) => updateAiSummary(...args),
  updateProactiveAstra: (...args: unknown[]) => updateProactiveAstra(...args),
}))
vi.mock('@/app/(app)/ai-settings/_components/use-user-facts', () => ({ useUserFacts: () => mocks.userFacts }))
vi.mock('@/components/ui/app-bar', () => ({ AppBar: () => <div data-testid="app-bar" /> }))
vi.mock('@/components/ui/section-label', () => ({ SectionLabel: ({ children, trailing }: { children: React.ReactNode; trailing?: React.ReactNode }) => <div>{children}{trailing}</div> }))
vi.mock('@/components/ui/confirm-dialog', () => ({
  ConfirmDialog: ({ open, onConfirm }: { open: boolean; onConfirm: () => void }) => (open ? <button type="button" aria-label="confirm-bulk" onClick={onConfirm} /> : null),
}))
vi.mock('@/app/(app)/ai-settings/_components/ai-feature-toggles', () => ({
  AiFeatureToggles: ({ onToggleMemory, onToggleSummary, onToggleProactive, onUpgrade }: {
    onToggleMemory: () => void; onToggleSummary: () => void; onToggleProactive: () => void; onUpgrade: () => void
  }) => (
    <div>
      <button type="button" aria-label="toggle-memory" onClick={onToggleMemory} />
      <button type="button" aria-label="toggle-summary" onClick={onToggleSummary} />
      <button type="button" aria-label="toggle-proactive" onClick={onToggleProactive} />
      <button type="button" aria-label="upgrade" onClick={onUpgrade} />
    </div>
  ),
}))
vi.mock('@/app/(app)/ai-settings/_components/pro-upgrade-link', () => ({ ProUpgradeLink: () => <span data-testid="pro-link" /> }))
vi.mock('@/app/(app)/ai-settings/_components/facts-select-bar', () => ({ FactsSelectBar: () => <div data-testid="select-bar" /> }))
vi.mock('@/app/(app)/ai-settings/_components/user-facts-list', () => ({ UserFactsList: () => <div data-testid="facts-list" /> }))

import AiSettingsPage from '@/app/(app)/ai-settings/page'

function defaultUserFacts(overrides: Record<string, unknown> = {}) {
  return {
    factsQuery: { isLoading: false, error: null, refetch: vi.fn() },
    facts: [],
    pagedFacts: [],
    selectMode: false,
    selectedFactIds: new Set<string>(),
    deleteMutation: { mutate: vi.fn() },
    bulkDeleteMutation: { mutate: vi.fn(), isPending: false },
    factsPage: 1,
    setFactsPage: vi.fn(),
    totalFactsPages: 1,
    toggleSelectMode: vi.fn(),
    toggleFactSelection: vi.fn(),
    toggleSelectAll: vi.fn(),
    ...overrides,
  }
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
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
    updateAiMemory.mockReset()
    updateAiSummary.mockReset()
    updateProactiveAstra.mockReset()
    mocks.profile = { hasProAccess: true, aiMemoryEnabled: false, aiSummaryEnabled: false, proactiveAstraEnabled: false }
    mocks.userFacts = defaultUserFacts()
  })

  it('optimistically enables AI memory when toggled', async () => {
    updateAiMemory.mockResolvedValue(undefined)
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'toggle-memory' }))
    expect(patchProfile).toHaveBeenCalledWith({ aiMemoryEnabled: true })
    await waitFor(() => expect(updateAiMemory).toHaveBeenCalledWith({ enabled: true }))
  })

  it('rolls the memory toggle back to its previous value on failure', async () => {
    updateAiMemory.mockRejectedValue(new Error('server down'))
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'toggle-memory' }))
    await waitFor(() => expect(patchProfile).toHaveBeenCalledWith({ aiMemoryEnabled: false }))
  })

  it('routes to upgrade from the feature toggles', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'upgrade' }))
    expect(push).toHaveBeenCalledWith('/upgrade')
  })

  it('shows the locked hint and pro link for free users, hiding the facts list', () => {
    mocks.profile = { hasProAccess: false, aiMemoryEnabled: false, aiSummaryEnabled: false, proactiveAstraEnabled: false }
    renderPage()
    expect(screen.getByTestId('pro-link')).toBeInTheDocument()
    expect(screen.queryByTestId('facts-list')).not.toBeInTheDocument()
  })

  it('renders the facts list and select bar for pro users with facts', () => {
    mocks.userFacts = defaultUserFacts({ facts: [{ id: 'f-1' }] })
    renderPage()
    expect(screen.getByTestId('facts-list')).toBeInTheDocument()
    expect(screen.getByTestId('select-bar')).toBeInTheDocument()
  })
})
