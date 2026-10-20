import React from 'react'
import { I18nextProvider } from 'react-i18next'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LoginContent } from '@/components/auth/login-content'
import { i18n } from '@/lib/i18n'

vi.unmock('react-i18next')

const TestRenderer = require('react-test-renderer')

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  onboardingState: {
    onboardingLocallyDone: false,
    habits: [] as { title: string }[],
  },
  params: {},
  replace: vi.fn(),
  push: vi.fn(),
}))

vi.mock('expo-router', () => ({
  useLocalSearchParams: () => mocks.params,
  useRouter: () => ({ replace: mocks.replace, push: mocks.push }),
}))

vi.mock('@/stores/onboarding-draft-store', () => ({
  useOnboardingDraftStore: (
    selector: (state: typeof mocks.onboardingState) => unknown,
  ) => selector(mocks.onboardingState),
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: { login: () => Promise<void> }) => unknown) =>
    selector({ login: vi.fn() }),
}))

vi.mock('@/hooks/use-offline', () => ({
  useOffline: () => ({ isOnline: true }),
}))

vi.mock('@/hooks/use-login-code-entry', () => ({
  useLoginCodeEntry: () => ({
    codeDigits: ['', '', '', '', '', ''],
    setCodeDigits: vi.fn(),
    resetCodeDigits: vi.fn(),
    startResendCountdown: vi.fn(),
    onCodeChange: vi.fn(),
    canResend: false,
    resendCountdown: 60,
  }),
}))

vi.mock('@/lib/api-client', () => ({ apiClient: vi.fn() }))
vi.mock('@/components/auth/turnstile-widget', () => ({ TurnstileWidget: () => null }))

vi.mock('@/lib/auth-flow', () => ({
  clearStoredReferralCode: vi.fn(),
  consumeStoredAuthReturnUrl: vi.fn(),
  getSafeReturnUrl: (url?: string) => url ?? '/',
  getStoredReferralCode: vi.fn().mockResolvedValue(undefined),
  isSafeReturnUrl: () => true,
  isValidReferralCode: () => false,
  isValidVerificationCode: () => false,
  storeAuthReturnUrl: vi.fn(),
  storeReferralCode: vi.fn(),
}))

vi.mock('@/lib/google-auth', () => ({ startMobileGoogleAuth: vi.fn() }))

vi.mock('@/lib/motion', () => ({
  toAnimatedEasing: (easing: unknown) => easing,
  usePrefersReducedMotion: () => true,
}))

vi.mock('@/components/ui/keyboard-aware-scroll-view', async () => {
  const { View } = await import('react-native')
  return {
    useKeyboardAwareInputReveal: () => null,
    KeyboardAwareScrollView: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
  }
})

interface TestNode {
  type: unknown
  props: Record<string, unknown>
  findAll(predicate: (node: TestNode) => boolean): TestNode[]
}

function renderedText(root: TestNode): string {
  return root
    .findAll((node) => node.type === 'Text')
    .flatMap((node) => React.Children.toArray(node.props.children as React.ReactNode))
    .filter((child): child is string => typeof child === 'string')
    .join(' ')
}

async function renderLogin(): Promise<{ root: TestNode; unmount(): void }> {
  let tree!: { root: TestNode; unmount(): void }
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(
      <I18nextProvider i18n={i18n}>
        <LoginContent />
      </I18nextProvider>,
    )
    await Promise.resolve()
  })
  return tree
}

beforeEach(async () => {
  vi.clearAllMocks()
  mocks.params = {}
  mocks.onboardingState.onboardingLocallyDone = false
  mocks.onboardingState.habits = []
  await i18n.changeLanguage('en')
})

describe('mobile login onboarding presentation', () => {
  it('shows normal sign-in for a returning person with an empty draft', async () => {
    mocks.onboardingState.onboardingLocallyDone = true
    const tree = await renderLogin()
    const text = renderedText(tree.root)

    expect(text).toContain(i18n.t('auth.emailTitle'))
    expect(text).not.toContain(i18n.t('auth.onboarding.title'))
    expect(text).not.toContain(i18n.t('auth.onboarding.habits', { count: 0 }))
    tree.unmount()
  })

  it('shows the plan-saving state for a real onboarding draft', async () => {
    mocks.onboardingState.onboardingLocallyDone = true
    mocks.onboardingState.habits = [{ title: 'Walk' }, { title: 'Read' }]
    const tree = await renderLogin()
    const text = renderedText(tree.root)

    expect(text).toContain(i18n.t('auth.onboarding.title'))
    expect(text).toContain(i18n.t('auth.onboarding.habits', { count: 2 }))
    expect(text).toContain(i18n.t('auth.onboarding.continue'))
    tree.unmount()
  })

  it('shows normal sign-in when onboarding was skipped without a draft', async () => {
    mocks.params = { from: 'onboarding' }
    const tree = await renderLogin()
    const text = renderedText(tree.root)

    expect(text).toContain(i18n.t('auth.emailTitle'))
    expect(text).not.toContain(i18n.t('auth.onboarding.title'))
    expect(text).not.toContain(i18n.t('auth.onboarding.habits', { count: 0 }))
    tree.unmount()
  })
})
