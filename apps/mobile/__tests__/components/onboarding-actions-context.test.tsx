import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OnboardingActions } from '@/components/onboarding/onboarding-actions-context'
import {
  OnboardingActionsProvider,
  useBufferOnboardingActions,
  useLiveOnboardingActions,
  useOnboardingActions,
  useOnboardingHasProAccess,
  useOnboardingIsLive,
} from '@/components/onboarding/onboarding-actions-context'
import type { Profile } from '@orbit/shared/types/profile'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  draftState: {
    bufferHabit: vi.fn(() => 2),
    bufferFirstLog: vi.fn(),
    bufferGoal: vi.fn(),
    bufferWeekStartDay: vi.fn(),
    bufferColorScheme: vi.fn(),
    markOnboardingLocallyDone: vi.fn(),
  },
  createHabitMutateAsync: vi.fn(async () => ({ id: 'server-id' })),
  bulkCreateHabitsMutateAsync: vi.fn(async () => ({ results: [] })),
  logHabitMutateAsync: vi.fn(async () => undefined),
  createGoalMutateAsync: vi.fn(async () => ({ id: 'goal-id' })),
  performQueuedApiMutation: vi.fn(async () => undefined),
  patchProfile: vi.fn(),
  applyScheme: vi.fn(),
  setItem: vi.fn(async () => undefined),
  setQueryData: vi.fn(),
}))

vi.mock('expo-router', () => ({
  useRouter: () => ({ replace: mocks.replace }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ setQueryData: mocks.setQueryData }),
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { setItem: mocks.setItem },
}))

vi.mock('@/stores/onboarding-draft-store', () => {
  const store = (selector: (state: typeof mocks.draftState) => unknown) =>
    selector(mocks.draftState)
  store.getState = () => mocks.draftState
  return { useOnboardingDraftStore: store }
})

vi.mock('@/hooks/use-habits', () => ({
  useCreateHabit: () => ({ mutateAsync: mocks.createHabitMutateAsync }),
  useBulkCreateHabits: () => ({ mutateAsync: mocks.bulkCreateHabitsMutateAsync }),
  useLogHabit: () => ({ mutateAsync: mocks.logHabitMutateAsync }),
}))

vi.mock('@/hooks/use-goals', () => ({
  useCreateGoal: () => ({ mutateAsync: mocks.createGoalMutateAsync }),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ patchProfile: mocks.patchProfile }),
}))

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ applyScheme: mocks.applyScheme }),
}))

vi.mock('@/lib/queued-api-mutation', () => ({
  performQueuedApiMutation: mocks.performQueuedApiMutation,
}))

function captureActions(useActions: () => OnboardingActions): OnboardingActions {
  const captured: { current: OnboardingActions | null } = { current: null }

  function Harness() {
    captured.current = useActions()
    return null
  }

  TestRenderer.act(() => {
    TestRenderer.create(<Harness />)
  })

  if (!captured.current) throw new Error('actions not captured')
  return captured.current
}

describe('onboarding action provider factories', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('buffers answers and omits onImport in pre-auth mode', async () => {
    const actions = captureActions(useBufferOnboardingActions)

    const created = await actions.createHabit({ title: 'Read' })
    expect(created).toEqual({ id: '2', title: 'Read' })
    expect(mocks.draftState.bufferHabit).toHaveBeenCalledWith({ title: 'Read' })

    await actions.createHabitsBulk([
      { title: 'Walk', emoji: '🚶', isGeneral: false, tags: ['movement'] },
      { title: 'Read' },
    ])
    expect(mocks.draftState.bufferHabit).toHaveBeenCalledWith({
      title: 'Walk',
      emoji: '🚶',
      isGeneral: false,
    })
    expect(mocks.draftState.bufferHabit).toHaveBeenCalledWith({ title: 'Read' })

    await actions.logHabit('2')
    expect(mocks.draftState.bufferFirstLog).toHaveBeenCalledWith(2, expect.any(String))

    await actions.setWeekStartDay(1)
    expect(mocks.draftState.bufferWeekStartDay).toHaveBeenCalledWith(1)

    await actions.finishOnboarding()
    expect(mocks.draftState.markOnboardingLocallyDone).toHaveBeenCalledTimes(1)
    expect(mocks.replace).toHaveBeenCalledWith('/login?from=onboarding')

    expect(actions.onImport).toBeUndefined()
  })

  it('writes through live server state and exposes onImport in post-auth mode', async () => {
    const actions = captureActions(useLiveOnboardingActions)

    const created = await actions.createHabit({ title: 'Run' })
    expect(mocks.createHabitMutateAsync).toHaveBeenCalledWith({ title: 'Run' })
    expect(created).toEqual({ id: 'server-id', title: 'Run' })

    await actions.createHabitsBulk([
      { title: 'Walk', tags: ['movement'] },
    ])
    expect(mocks.bulkCreateHabitsMutateAsync).toHaveBeenCalledWith({
      habits: [{ title: 'Walk', tags: ['movement'] }],
    })

    await actions.setColorScheme('blue')
    expect(mocks.applyScheme).toHaveBeenCalledWith('blue')

    expect(actions.onImport).toBeTypeOf('function')
  })

  it('buffers goals and color scheme in pre-auth mode', async () => {
    const actions = captureActions(useBufferOnboardingActions)

    await actions.createGoal({ title: 'Ship', targetValue: 1, unit: 'app' })
    expect(mocks.draftState.bufferGoal).toHaveBeenCalledWith({
      title: 'Ship',
      targetValue: 1,
      unit: 'app',
    })

    await actions.setColorScheme('amber')
    expect(mocks.draftState.bufferColorScheme).toHaveBeenCalledWith('amber')
  })

  it('logs, creates goals, and queues the week-start day in live mode', async () => {
    const actions = captureActions(useLiveOnboardingActions)

    await actions.logHabit('server-id')
    expect(mocks.logHabitMutateAsync).toHaveBeenCalledWith({ habitId: 'server-id' })

    await actions.createGoal({ title: 'Ship', targetValue: 1, unit: 'app' })
    expect(mocks.createGoalMutateAsync).toHaveBeenCalledWith({
      title: 'Ship',
      targetValue: 1,
      unit: 'app',
    })

    await actions.setWeekStartDay(1)
    expect(mocks.performQueuedApiMutation).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'setWeekStartDay', payload: { weekStartDay: 1 } }),
    )
    expect(mocks.patchProfile).toHaveBeenCalledWith({ weekStartDay: 1 })
  })

  it('completes onboarding and patches the cached profile in live mode', async () => {
    const actions = captureActions(useLiveOnboardingActions)

    await actions.finishOnboarding()

    expect(mocks.performQueuedApiMutation).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'completeOnboarding' }),
    )
    expect(mocks.replace).toHaveBeenCalledWith('/')

    const updater = mocks.setQueryData.mock.calls.at(-1)?.[1] as (
      old: Profile | undefined,
    ) => Profile | undefined
    const existing = { hasCompletedOnboarding: false } as unknown as Profile
    expect(updater(existing)?.hasCompletedOnboarding).toBe(true)
    expect(updater(undefined)).toBeUndefined()
  })

  it('tolerates a failed completion mutation but still advances', async () => {
    mocks.performQueuedApiMutation.mockRejectedValueOnce(new Error('offline'))
    const actions = captureActions(useLiveOnboardingActions)

    await actions.finishOnboarding()

    expect(mocks.replace).toHaveBeenCalledWith('/')
  })

  it('imports the onboarding prompt into the chat draft in live mode', async () => {
    const actions = captureActions(useLiveOnboardingActions)

    actions.onImport?.()

    await vi.waitFor(() => {
      expect(mocks.setItem).toHaveBeenCalledWith(
        expect.any(String),
        'onboarding.flow.meetAstra.importPrompt',
      )
      expect(mocks.replace).toHaveBeenCalledWith('/chat')
    })
  })
})

const stubActions: OnboardingActions = {
  createHabit: vi.fn(async () => ({ id: '1', title: 'x' })),
  createHabitsBulk: vi.fn(async () => {}),
  logHabit: vi.fn(async () => {}),
  createGoal: vi.fn(async () => {}),
  setWeekStartDay: vi.fn(async () => {}),
  setColorScheme: vi.fn(async () => {}),
  finishOnboarding: vi.fn(async () => {}),
}

describe('OnboardingActionsProvider', () => {
  it('exposes the actions, pro access, and live flag to consumers', () => {
    const captured = {
      actions: null as OnboardingActions | null,
      pro: false,
      live: false,
    }

    function Child() {
      captured.actions = useOnboardingActions()
      captured.pro = useOnboardingHasProAccess()
      captured.live = useOnboardingIsLive()
      return null
    }

    TestRenderer.act(() => {
      TestRenderer.create(
        <OnboardingActionsProvider actions={stubActions} hasProAccess isLive>
          <Child />
        </OnboardingActionsProvider>,
      )
    })

    expect(captured.actions).toBe(stubActions)
    expect(captured.pro).toBe(true)
    expect(captured.live).toBe(true)
  })

  it('throws when the action hooks are used outside the provider', () => {
    function Orphan() {
      useOnboardingActions()
      return null
    }

    expect(() => {
      TestRenderer.act(() => {
        TestRenderer.create(<Orphan />)
      })
    }).toThrow('useOnboardingActions must be used within an OnboardingActionsProvider')
  })
})
