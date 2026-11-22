import { expectSmallSheetActions, sheetSlotButtons } from '@/__tests__/support/sheet-slots'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, create as createRenderer } from 'react-test-renderer'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { buildAccountScopedStorageKey } from '@orbit/shared/utils'
import { TrialExpiredModal } from '@/components/ui/trial-expired-modal'
import { useAuthStore } from '@/stores/auth-store'
import { useUIStore } from '@/stores/ui-store'
import { sheetTestControls } from '@/__tests__/support/sheet-double'


const LEGACY_TRIAL_KEY = 'orbit_trial_expired_seen'
const ACCOUNT_A_TRIAL_KEY = buildAccountScopedStorageKey(LEGACY_TRIAL_KEY, 'user-1')
const ACCOUNT_B_TRIAL_KEY = buildAccountScopedStorageKey(LEGACY_TRIAL_KEY, 'user-2')
const renderedTrees: { unmount: () => void }[] = []
function create(element: React.ReactElement) {
  const tree = createRenderer(element)
  renderedTrees.push(tree)
  return tree
}

function holdAccount(userId: string): void {
  useAuthStore.setState({
    isAuthenticated: true,
    user: { userId, name: 'Ada', email: `${userId}@example.com` },
  })
}

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

function parentView(node: import('react-test-renderer').ReactTestInstance) {
  type ParentedInstance = import('react-test-renderer').ReactTestInstance & { parent: ParentedInstance | null }
  let parent = (node as ParentedInstance).parent
  while (parent && String(parent.type) !== 'View') parent = parent.parent
  if (!parent) throw new Error('Text has no containing view')
  return parent
}

const push = vi.hoisted(() => vi.fn())
const profileState = vi.hoisted(() => ({ trialExpired: true }))

vi.mock('expo-router', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push }),
}))

vi.mock('@/hooks/use-profile', () => ({
  useTrialExpired: () => profileState.trialExpired,
}))

vi.mock('@/components/ui/sheet', async () =>
  await import('@/__tests__/support/sheet-double'),
)

describe('TrialExpiredModal (mobile)', () => {

  beforeEach(() => {
    vi.restoreAllMocks()
    profileState.trialExpired = true
    useUIStore.setState({ openOverlayIds: [], showCreateModal: false })
    storedFlags({})
    holdAccount('user-1')
  })

  afterEach(async () => {
    await act(() => {
      for (const tree of renderedTrees.splice(0)) tree.unmount()
    })
    sheetTestControls.defer(false)
  })

  it('gives the pre-rename dismissal to the account signed in now and then consumes it', async () => {
    storedFlags({ [LEGACY_TRIAL_KEY]: '1' })
    const setItem = vi.spyOn(AsyncStorage, 'setItem').mockResolvedValue(undefined)
    const removeItem = vi.spyOn(AsyncStorage, 'removeItem').mockResolvedValue(undefined)

    expect(renderedText(await renderModal())).not.toContain('trial.expired.orbitCeiling')
    expect(setItem).toHaveBeenCalledWith(ACCOUNT_A_TRIAL_KEY, '1')
    expect(removeItem).toHaveBeenCalledWith(LEGACY_TRIAL_KEY)
  })
})
