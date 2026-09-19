import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, create } from 'react-test-renderer'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { buildAccountScopedStorageKey } from '@orbit/shared/utils'
import { TrialExpiredModal } from '@/components/ui/trial-expired-modal'
import { useAuthStore } from '@/stores/auth-store'
import { sheetTestControls } from '@/__tests__/support/sheet-double'

const LEGACY_TRIAL_KEY = 'orbit_trial_expired_seen'
const ACCOUNT_A_TRIAL_KEY = buildAccountScopedStorageKey(LEGACY_TRIAL_KEY, 'user-1')
const ACCOUNT_B_TRIAL_KEY = buildAccountScopedStorageKey(LEGACY_TRIAL_KEY, 'user-2')

/** Signs the device in, because the notice is owed to one account and its key names that account. */
function holdAccount(userId: string): void {
  useAuthStore.setState({
    isAuthenticated: true,
    user: { userId, name: 'Ada', email: `${userId}@example.com` },
  })
}

/** Answers a `multiGet` the way AsyncStorage does, one pair per requested key. */
function storedFlags(stored: Record<string, string>) {
  return vi
    .spyOn(AsyncStorage, 'multiGet')
    .mockImplementation((keys) =>
      Promise.resolve(keys.map((key): [string, string | null] => [key, stored[key] ?? null])),
    )
}

async function renderModal() {
  let tree: import('react-test-renderer').ReactTestRenderer | undefined
  await act(async () => {
    tree = create(<TrialExpiredModal />)
    await Promise.resolve()
  })
  return tree
}

function renderedText(tree: import('react-test-renderer').ReactTestRenderer | undefined) {
  return tree?.root
    .findAll((node) => String(node.type) === 'Text')
    .map((node) => node.props.children)
}

const push = vi.hoisted(() => vi.fn())

vi.mock('expo-router', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push }),
}))

vi.mock('@/hooks/use-profile', () => ({
  useTrialExpired: () => true,
}))

vi.mock('@/components/ui/sheet', async () =>
  await import('@/__tests__/support/sheet-double'),
)

describe('TrialExpiredModal (mobile)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    storedFlags({})
    holdAccount('user-1')
  })

  afterEach(() => {
    sheetTestControls.defer(false)
  })

  it('renders only the current paused Pro features', async () => {
    let tree: import('react-test-renderer').ReactTestRenderer | undefined

    await act(async () => {
      tree = create(<TrialExpiredModal />)
      await Promise.resolve()
    })

    const renderedText = tree?.root
      .findAll((node) => String(node.type) === 'Text')
      .map((node) => node.props.children)

    expect(renderedText).toContain('trial.expired.astraCeiling')
    expect(renderedText).toContain('trial.expired.calendarSync')
    expect(renderedText).toContain('trial.expired.retrospective')
    expect(renderedText).toContain('trial.expired.proactiveAstra')
    expect(renderedText).not.toContain('trial.expired.savings')
    expect(renderedText).not.toContain('trial.expired.subHabits')
    expect(renderedText).not.toContain('trial.expired.goals')
  })

  it('routes to upgrade only after the sheet dismisses', async () => {
    sheetTestControls.defer(true)
    let tree: import('react-test-renderer').ReactTestRenderer | undefined

    await act(async () => {
      tree = create(<TrialExpiredModal />)
      await Promise.resolve()
    })

    const subscribe = tree?.root.findAll(
      (node) => String(node.type) === 'Pressable' && node.findAll(
        (child) => String(child.type) === 'Text' && child.props.children === 'trial.expired.subscribe',
      ).length > 0,
    )[0]
    if (!subscribe) throw new Error('Subscribe action not found')

    await act(() => (subscribe.props as { onPress: () => void }).onPress())

    expect(sheetTestControls.isDismissPending).toBe(true)
    expect(push).not.toHaveBeenCalled()

    await act(() => sheetTestControls.completeDismissal())

    expect(push).toHaveBeenCalledWith({
      pathname: '/upgrade',
      params: { from: '/' },
    })
    expect(push).toHaveBeenCalledTimes(1)
  })

  it('shows the notice to the next account after the previous one dismissed it', async () => {
    storedFlags({ [ACCOUNT_A_TRIAL_KEY]: '1' })
    holdAccount('user-2')
    vi.spyOn(AsyncStorage, 'setItem').mockResolvedValue(undefined)

    expect(renderedText(await renderModal())).toContain('trial.expired.astraCeiling')
    expect(ACCOUNT_B_TRIAL_KEY).not.toBe(ACCOUNT_A_TRIAL_KEY)
  })

  it('gives the pre-rename dismissal to the account signed in now and then consumes it', async () => {
    storedFlags({ [LEGACY_TRIAL_KEY]: '1' })
    const setItem = vi.spyOn(AsyncStorage, 'setItem').mockResolvedValue(undefined)
    const removeItem = vi.spyOn(AsyncStorage, 'removeItem').mockResolvedValue(undefined)

    expect(renderedText(await renderModal())).not.toContain('trial.expired.astraCeiling')
    expect(setItem).toHaveBeenCalledWith(ACCOUNT_A_TRIAL_KEY, '1')
    expect(removeItem).toHaveBeenCalledWith(LEGACY_TRIAL_KEY)
  })
})
