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
  renderedTrees.push(tree as unknown as { unmount: () => void })
  return tree
}

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

function parentView(node: import('react-test-renderer').ReactTestInstance) {
  type ParentedInstance = import('react-test-renderer').ReactTestInstance & { parent: ParentedInstance | null }
  let parent = (node as ParentedInstance).parent
  while (parent && String(parent.type) !== 'View') parent = parent.parent
  if (!parent) throw new Error('Text has no containing view')
  return parent
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
  it('uses a small intrinsic dismissal before Subscribe', async () => {
    const tree = await renderModal()
    expect(sheetSlotButtons(tree!.root, 'SheetActions')).toEqual(['trial.expired.continueFree', 'trial.expired.subscribe'])
    expectSmallSheetActions(tree!.root)
  })

  beforeEach(() => {
    vi.restoreAllMocks()
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

  it('waits for an open sheet before presenting the trial notice', async () => {
    useUIStore.getState().registerOpenOverlay('existing-sheet')
    const tree = await renderModal()
    expect(renderedText(tree)).not.toContain('trial.expired.astraCeiling')

    await act(async () => {
      useUIStore.getState().unregisterOpenOverlay('existing-sheet')
      await Promise.resolve()
    })
    expect(renderedText(tree)).toContain('trial.expired.astraCeiling')
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

  it('places each paused status on the supporting line beneath its feature label', async () => {
    const tree = await renderModal()
    const pausedStatuses = tree!.root.findAll(
      (node) => String(node.type) === 'Text' && node.props.children === 'trial.expired.paused',
    )
    expect(pausedStatuses).toHaveLength(4)
    for (const [index, feature] of ['astraCeiling', 'calendarSync', 'retrospective', 'proactiveAstra'].entries()) {
      const label = tree!.root.findAll(
        (node) => String(node.type) === 'Text' && node.props.children === `trial.expired.${feature}`,
      )[0]!
      const textBlock = parentView(parentView(label))
      expect(parentView(pausedStatuses[index]!) === textBlock).toBe(true)
      expect(textBlock.findAll((node) => String(node.type) === 'Text').map((node) => node.props.children))
        .toEqual([`trial.expired.${feature}`, 'trial.expired.paused'])
    }
  })

  it('shows the notice to the next account after the previous one dismissed it', async () => {
    vi.spyOn(AsyncStorage, 'setItem').mockResolvedValue(undefined)
    const tree = await renderModal()
    const continueFree = tree?.root.findAll(
      (node) => String(node.type) === 'Pressable' && node.findAll(
        (child) => String(child.type) === 'Text' && child.props.children === 'trial.expired.continueFree',
      ).length > 0,
    )[0]
    if (!continueFree) throw new Error('Continue Free action not found')
    await act(() => (continueFree.props as { onPress: () => void }).onPress())
    expect(renderedText(tree)).not.toContain('trial.expired.astraCeiling')

    await act(async () => {
      holdAccount('user-2')
      await Promise.resolve()
    })

    expect(renderedText(tree)).toContain('trial.expired.astraCeiling')
    expect(ACCOUNT_B_TRIAL_KEY).not.toBe(ACCOUNT_A_TRIAL_KEY)
  })

  it('waits for the next account seen flag before showing the notice', async () => {
    let finishRead!: (value: [string, string | null][]) => void
    vi.spyOn(AsyncStorage, 'multiGet').mockImplementation((keys) => {
      if (keys[0] === ACCOUNT_B_TRIAL_KEY) {
        return new Promise((resolve) => { finishRead = resolve })
      }
      return Promise.resolve(keys.map((key): [string, string | null] => [key, null]))
    })
    const tree = await renderModal()
    expect(renderedText(tree)).toContain('trial.expired.astraCeiling')

    await act(async () => {
      holdAccount('user-2')
      await Promise.resolve()
    })
    expect(renderedText(tree)).not.toContain('trial.expired.astraCeiling')

    await act(async () => {
      finishRead([[ACCOUNT_B_TRIAL_KEY, '1'], [LEGACY_TRIAL_KEY, null]])
      await Promise.resolve()
    })
    expect(renderedText(tree)).not.toContain('trial.expired.astraCeiling')
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
