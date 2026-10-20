import { beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import PrivacyScreen from '@/app/privacy'
import TermsScreen from '@/app/terms'
import { press, renderNavigation } from '../components/ui/navigation-render'

const navigation = vi.hoisted(() => ({
  canDismiss: vi.fn(), dismiss: vi.fn(), dismissTo: vi.fn(), push: vi.fn(), authenticated: true,
  messages: {},
}))
vi.mock('expo-router', () => ({ useRouter: () => navigation }))
vi.mock('@/lib/overlay-stack', () => ({ dismissTopOverlay: () => false }))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (select: (state: { isAuthenticated: boolean }) => boolean) => select({ isAuthenticated: navigation.authenticated }),
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => {
    let value: unknown = navigation.messages
    for (const segment of key.split('.')) value = (value as Record<string, unknown>)[segment]
    return value as string
  } }),
}))

beforeEach(() => { vi.clearAllMocks() })

describe.each([{ locale: 'en', messages: en }, { locale: 'pt-BR', messages: ptBR }])('legal navigation in $locale', ({ messages }) => {
  it.each([
    { Screen: PrivacyScreen, label: messages.privacy.close },
    { Screen: TermsScreen, label: messages.terms.close },
  ])('closes $label through the existing stack', ({ Screen, label }) => {
    navigation.messages = messages
    navigation.authenticated = true
    navigation.canDismiss.mockReturnValue(true)
    const tree = renderNavigation(<Screen />)
    press(tree.hosts().find((node) => node.props.accessibilityLabel === label)!)
    expect(navigation.dismiss).toHaveBeenCalledExactlyOnceWith()
    expect(navigation.dismissTo).not.toHaveBeenCalled()
    tree.unmount()
  })

  it.each([
    { Screen: PrivacyScreen, label: messages.privacy.close, authenticated: true, fallback: '/' },
    { Screen: PrivacyScreen, label: messages.privacy.close, authenticated: false, fallback: '/login' },
    { Screen: TermsScreen, label: messages.terms.close, authenticated: true, fallback: '/' },
    { Screen: TermsScreen, label: messages.terms.close, authenticated: false, fallback: '/login' },
  ])('closes a directly opened page to $fallback', ({ Screen, label, authenticated, fallback }) => {
    navigation.messages = messages
    navigation.authenticated = authenticated
    navigation.canDismiss.mockReturnValue(false)
    const tree = renderNavigation(<Screen />)
    press(tree.hosts().find((node) => node.props.accessibilityLabel === label)!)
    expect(navigation.dismissTo).toHaveBeenCalledExactlyOnceWith(fallback)
    expect(navigation.dismiss).not.toHaveBeenCalled()
    tree.unmount()
  })
})
