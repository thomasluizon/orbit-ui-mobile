import { act, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NextIntlClientProvider } from 'next-intl'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { holdAccount } from '@/__tests__/support/account-change'

const mocks = vi.hoisted(() => ({ consent: null as boolean | null, updateConsent: vi.fn(), patchProfile: vi.fn(), replace: vi.fn() }))
vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { name: 'Ada', email: 'ada@example.com', marketingEmailConsent: mocks.consent }, patchProfile: mocks.patchProfile, invalidate: vi.fn() }),
}))
vi.mock('@/lib/actions/profile', () => ({ updateMarketingConsent: (...args: unknown[]) => mocks.updateConsent(...args), updateName: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace, push: vi.fn() }), useSearchParams: () => new URLSearchParams('code=c&state=s') }))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

import { MarketingConsentSection } from '@/app/(app)/preferences/_components/marketing-consent-section'
import { EditNameSheet } from '@/app/(app)/profile/_components/edit-name-sheet'
import { PushDevicesRow } from '@/components/profile/push-devices-row'

const locales = [{ locale: 'en', messages: en }, { locale: 'pt-BR', messages: ptBR }] as const

function mount(locale: string, messages: typeof en, node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><NextIntlClientProvider locale={locale} messages={messages}>{node}</NextIntlClientProvider></QueryClientProvider>)
}

const SPINNER_SELECTOR = '.animate-spin, [data-spinner], [data-lucide="loader-2"], [data-lucide="loader-circle"]'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.consent = null
  mocks.updateConsent.mockResolvedValue(undefined)
  holdAccount('user-1')
})

describe.each(locales)('Perfil settings with orbit_guided_flows in $locale', ({ locale, messages }) => {
  it('answers the product email question with two quick options', async () => {
    mount(locale, messages, <MarketingConsentSection showSectionLabel={false} contained guided />)
    expect(screen.getByText(messages.profile.marketingEmails.question)).toBeInTheDocument()
    const options = [...document.querySelectorAll('[data-option-card]')].map((option) => option.textContent)
    expect(options).toEqual([messages.profile.marketingEmails.decline, messages.profile.marketingEmails.accept])
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: messages.profile.marketingEmails.accept })) })
    expect(mocks.updateConsent).toHaveBeenCalledWith({ enabled: true }, 'user-1')
    expect(mocks.patchProfile).toHaveBeenCalledWith({ marketingEmailConsent: true })
  })

  it('titles the name sheet with its question, which also names the field', () => {
    mount(locale, messages, <EditNameSheet open guided onOpenChange={vi.fn()} />)
    const named = screen.getAllByText(messages.profile.editName.label)
    expect(named.filter((node) => node.tagName !== 'LABEL')).toHaveLength(1)
    expect(named.find((node) => node.tagName === 'LABEL')).toHaveClass('sr-only')
    expect(screen.queryByText(messages.profile.editName.title)).toBeNull()
    expect(screen.getByRole('textbox', { name: messages.profile.editName.label })).toHaveValue('Ada')
  })

  it('draws a skeleton and no spinner while the push devices load', () => {
    mount(locale, messages, <PushDevicesRow count={undefined} max={undefined} currentDeviceRegistered={false} supported loading error={false} permission="default" status="idle" onToggle={vi.fn()} onRetry={vi.fn()} />)
    const skeleton = screen.getByRole('progressbar', { name: messages.profile.loading })
    expect(skeleton).toHaveAttribute('data-variant', 'settings')
    expect(document.querySelector(SPINNER_SELECTOR)).toBeNull()
    expect(screen.queryByText(messages.profile.loading)).toBeNull()
  })
})

describe('flag off', () => {
  it('keeps the current answers and the current name sheet title', () => {
    mount('en', en, <><MarketingConsentSection showSectionLabel={false} contained /><EditNameSheet open onOpenChange={vi.fn()} /></>)
    expect(document.querySelector('[data-option-card]')).toBeNull()
    expect(screen.getByText(en.profile.editName.title)).toBeInTheDocument()
  })
})
