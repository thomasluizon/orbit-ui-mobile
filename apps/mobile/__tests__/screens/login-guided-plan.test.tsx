import React from 'react'
import { I18nextProvider } from 'react-i18next'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LoginContent } from '@/components/auth/login-content'
import { i18n } from '@/lib/i18n'
import { resolveMotionPreset, type MotionScenario } from '@orbit/shared/theme'

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
  useNavigation: () => ({ dispatch: vi.fn() }),
  useLocalSearchParams: () => mocks.params,
  useRouter: () => ({ replace: mocks.replace, push: mocks.push }),
}))

vi.mock('@/stores/onboarding-draft-store', () => ({
  useOnboardingDraftStore: (
    selector: (state: typeof mocks.onboardingState) => unknown,
  ) => selector(mocks.onboardingState),
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: Object.assign((selector: (state: { login: unknown; isLoading: boolean }) => unknown) => selector({ login: vi.fn(), isLoading: false }), {
    getState: () => ({ isAuthenticated: false, isLoading: false }),
    subscribe: () => () => {},
  }),
  getSessionGeneration: () => ({ epoch: 0, credentialVersion: 0 }),
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
  useResolvedMotionPreset: (scenario: MotionScenario) => resolveMotionPreset(scenario, true),
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
  children: (TestNode | string)[]
  findAll(predicate: (node: TestNode) => boolean): TestNode[]
}

const textOf = (node: TestNode): string => node.children.map((child) => typeof child === 'string' ? child : textOf(child)).join('')
const buttonNames = (root: TestNode) => root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityRole === 'button')
  .map((node) => (node.props.accessibilityLabel as string | undefined) ?? textOf(node))
const questions = (root: TestNode) => root.findAll((node) => node.type === 'Text' && node.props.accessibilityRole === 'header')
const orbitLines = (root: TestNode) => questions(root).map((node) => node.props.accessibilityHint)

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

describe('mobile guided sign-in states the plan that waits only for a real draft', () => {
  it('asks the email question for a returning person with an empty draft', async () => {
    mocks.onboardingState.onboardingLocallyDone = true
    const tree = await renderLogin()
    expect(questions(tree.root).map(textOf)).toEqual([i18n.t('auth.email')])
    expect(buttonNames(tree.root)).not.toContain(i18n.t('auth.onboarding.continue'))
    expect(orbitLines(tree.root)).not.toContain(i18n.t('auth.line.plan', { count: 0 }))
    tree.unmount()
  })

  it('states the plan for a real onboarding draft', async () => {
    mocks.onboardingState.onboardingLocallyDone = true
    mocks.onboardingState.habits = [{ title: 'Walk' }, { title: 'Read' }]
    const tree = await renderLogin()
    expect(orbitLines(tree.root)).toContain(i18n.t('auth.line.plan', { count: 2 }))
    expect(buttonNames(tree.root)).toContain(i18n.t('auth.onboarding.continue'))
    tree.unmount()
  })

  it('asks the email question when onboarding was skipped without a draft', async () => {
    mocks.params = { from: 'onboarding' }
    const tree = await renderLogin()
    expect(questions(tree.root).map(textOf)).toEqual([i18n.t('auth.email')])
    expect(buttonNames(tree.root)).not.toContain(i18n.t('auth.onboarding.continue'))
    expect(orbitLines(tree.root)).not.toContain(i18n.t('auth.line.plan', { count: 0 }))
    tree.unmount()
  })
})
