import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import AsyncStorage from '@react-native-async-storage/async-storage'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { enableTestFlags } from '@orbit/shared/test-support/flag-state'
import { buildAccountScopedStorageKey } from '@orbit/shared/utils'
import { renderedText } from '@/__tests__/support/react-test-renderer'
import { TrialExpiredModal } from '@/components/ui/trial-expired-modal'
import { useAuthStore } from '@/stores/auth-store'
import { useUIStore } from '@/stores/ui-store'
import { reanimatedTestState } from '@/test-mocks/react-native-reanimated'

interface TrialMocks {
  locale: 'en' | 'pt-BR'
  push: ReturnType<typeof vi.fn>
  plans: { savingsPercent: number } | null
  reducedMotion: boolean
}

const mocks = vi.hoisted((): TrialMocks => ({ locale: 'en', push: vi.fn(), plans: { savingsPercent: 41 }, reducedMotion: false }))

vi.mock('react-i18next', async () => {
  const { testI18n } = await import('@/__tests__/support/i18n')
  return { useTranslation: () => ({ t: testI18n.getFixedT(mocks.locale), i18n: { language: mocks.locale } }) }
})
vi.mock('expo-router', () => ({ usePathname: () => '/calendar', useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/hooks/use-profile', () => ({ useTrialExpired: () => true }))
vi.mock('@/hooks/use-subscription-plans', () => ({ useSubscriptionPlans: () => ({ plans: mocks.plans }) }))
vi.mock('@/lib/motion', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/motion')>(), usePrefersReducedMotion: () => mocks.reducedMotion }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))

const SEEN_KEY = buildAccountScopedStorageKey('orbit_trial_expired_seen', 'user-1')
let tree: ReactTestRenderer

async function renderDialog() {
  await act(async () => {
    tree = create(<TrialExpiredModal />)
    await Promise.resolve()
  })
}

const hosts = () => tree.root.findAll((node) => typeof node.type === 'string')
const byTestId = (testID: string) => hosts().find((node) => node.props.testID === testID)
const action = (label: string) => hosts().find((node) => typeof node.props.onPress === 'function' && renderedText(node) === label)!
const pressAction = (node: ReactTestInstance) => act(() => { (node.props.onPress as () => void)() })

beforeEach(() => {
  vi.restoreAllMocks()
  mocks.push.mockClear()
  mocks.locale = 'en'
  mocks.plans = { savingsPercent: 41 }
  mocks.reducedMotion = false
  vi.spyOn(AsyncStorage, 'multiGet').mockImplementation((keys) => Promise.resolve(keys.map((key): [string, string | null] => [key, null])))
  vi.spyOn(AsyncStorage, 'setItem').mockResolvedValue()
  useUIStore.setState({ openOverlayIds: [], showCreateModal: false })
  useAuthStore.setState({ isAuthenticated: true, user: { userId: 'user-1', name: 'Ada', email: 'user-1@example.com' } })
  enableTestFlags('orbit_guided_flows')
})

afterEach(() => {
  reanimatedTestState.reducedMotion = false
  return act(() => tree.unmount())
})

describe('the Android trial expired dialog', () => {
  it.each([
    ['en', 'Your Pro trial ended', 'These Pro features will pause unless you subscribe.', 'View plans', 'Stay free'],
    ['pt-BR', 'O teste Pro acabou', 'Estes recursos Pro ficam pausados se você não assinar.', 'Ver planos', 'Continuar grátis'],
  ] as const)('is a centred dialog with a name, Orbit in Parado, the current lines and the two actions in %s', async (locale, heading, subtitle, seePlans, stayFree) => {
    mocks.locale = locale
    await renderDialog()
    const dialog = byTestId('trial-expired-dialog')!
    expect(dialog.props).toMatchObject({ accessibilityViewIsModal: true, accessibilityLabel: heading, accessibilityHint: subtitle })
    const rigs = hosts().filter((node) => node.props['data-orbit-face'] === 'rig')
    expect(rigs.map((node) => node.props['data-orbit-state'])).toEqual(['parado'])
    const text = renderedText(dialog)
    const messages = locale === 'en' ? en : ptBR
    for (const line of [messages.trial.expired.eyebrow, messages.trial.expired.astraCeiling, messages.trial.expired.calendarSync, messages.trial.expired.retrospective, messages.trial.expired.proactiveAstra, messages.trial.expired.paused]) {
      expect(text).toContain(line)
    }
    expect(renderedText(byTestId('trial-expired-savings'))).toContain('41%')
    expect(action(seePlans)).toBeDefined()
    expect(action(stayFree)).toBeDefined()
  })

  it('opens the upgrade route with the place of the person and records the notice as seen on View plans', async () => {
    await renderDialog()
    await pressAction(action('View plans'))
    expect(mocks.push).toHaveBeenCalledWith({ pathname: '/upgrade', params: { from: '/calendar' } })
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(SEEN_KEY, '1')
    expect(byTestId('trial-expired-dialog')).toBeUndefined()
  })

  it('closes and keeps the person on the free plan on Stay free, on a scrim press and on Android back', async () => {
    await renderDialog()
    await pressAction(action('Stay free'))
    expect(byTestId('trial-expired-dialog')).toBeUndefined()
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(SEEN_KEY, '1')
    expect(mocks.push).not.toHaveBeenCalled()
    await act(() => tree.unmount())
    await renderDialog()
    await pressAction(byTestId('trial-expired-scrim')!)
    expect(byTestId('trial-expired-dialog')).toBeUndefined()
    await act(() => tree.unmount())
    await renderDialog()
    const modal = tree.root.findAll((node) => typeof node.props.onRequestClose === 'function')[0]!
    await act(() => { (modal.props.onRequestClose as () => void)() })
    expect(byTestId('trial-expired-dialog')).toBeUndefined()
  })

  it.each([[false, 'fade', 'running'], [true, 'none', 'still']] as const)('opens with reduced motion %s through the %s presentation, with a %s Orbit', async (reducedMotion, animationType, loop) => {
    mocks.reducedMotion = reducedMotion
    reanimatedTestState.reducedMotion = reducedMotion
    await renderDialog()
    const modal = tree.root.findAll((node) => typeof node.props.onRequestClose === 'function')[0]!
    expect(modal.props.animationType).toBe(animationType)
    const rig = tree.root.findAll((node) => typeof node.type === 'string' && node.props['data-orbit-face'] === 'rig')
    expect(rig.map((node) => node.props['data-orbit-loop'] as string)).toEqual([loop])
  })

  it('shows no savings line before the plans read answers', async () => {
    mocks.plans = null
    await renderDialog()
    expect(byTestId('trial-expired-savings')).toBeUndefined()
  })
})
