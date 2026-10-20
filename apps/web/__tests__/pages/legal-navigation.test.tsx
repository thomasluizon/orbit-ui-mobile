import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import PrivacyPage from '@/app/(public)/privacy/page'
import TermsPage from '@/app/(public)/terms/page'
import { updateAppNavigationHistory } from '@/lib/app-navigation-history'

const navigation = vi.hoisted(() => ({ back: vi.fn(), replace: vi.fn(), push: vi.fn(), authenticated: true }))
vi.mock('next/navigation', () => ({ useRouter: () => navigation }))
vi.mock('@/lib/overlay-stack', () => ({ dismissTopOverlay: () => false }))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (select: (state: { isAuthenticated: boolean }) => boolean) => select({ isAuthenticated: navigation.authenticated }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
})

describe.each([{ locale: 'en', messages: en }, { locale: 'pt-BR', messages: ptBR }])('legal navigation in $locale', ({ locale, messages }) => {
  it.each([
    { Page: PrivacyPage, route: '/privacy', label: messages.privacy.close },
    { Page: TermsPage, route: '/terms', label: messages.terms.close },
  ])('closes $route through history when opened from About', ({ Page, route, label }) => {
    navigation.authenticated = true
    updateAppNavigationHistory('/about', 'init')
    updateAppNavigationHistory(route, 'push')
    render(<NextIntlClientProvider locale={locale} messages={messages}><Page /></NextIntlClientProvider>)
    fireEvent.click(screen.getByRole('button', { name: label }))
    expect(navigation.back).toHaveBeenCalledExactlyOnceWith()
    expect(navigation.replace).not.toHaveBeenCalled()
  })

  it.each([
    { Page: PrivacyPage, label: messages.privacy.close, authenticated: true, fallback: '/' },
    { Page: PrivacyPage, label: messages.privacy.close, authenticated: false, fallback: '/login' },
    { Page: TermsPage, label: messages.terms.close, authenticated: true, fallback: '/' },
    { Page: TermsPage, label: messages.terms.close, authenticated: false, fallback: '/login' },
  ])('closes a directly opened page to $fallback', ({ Page, label, authenticated, fallback }) => {
    navigation.authenticated = authenticated
    render(<NextIntlClientProvider locale={locale} messages={messages}><Page /></NextIntlClientProvider>)
    fireEvent.click(screen.getByRole('button', { name: label }))
    expect(navigation.replace).toHaveBeenCalledExactlyOnceWith(fallback)
    expect(navigation.back).not.toHaveBeenCalled()
  })
})
