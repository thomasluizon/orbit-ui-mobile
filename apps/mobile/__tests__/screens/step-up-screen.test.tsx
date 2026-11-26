import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  STEP_UP_ATTEMPT_WINDOW_MS,
  STEP_UP_CHALLENGE_DURATION_MS,
  type StepUpTimingRecord,
} from '@orbit/shared/utils'
import { API } from '@orbit/shared/api'
import StepUpScreen from '@/app/step-up'
import { advanceAccountGeneration, advanceSessionEpoch } from '@/lib/session-epoch'
import { expectPressPaint } from '@/__tests__/support/press-feedback'
import { createTokensV2 } from '@/lib/theme'
import { captureGuidedFlowEvent } from '@/lib/posthog'

const PINNED_TEST_TIME = new Date('2026-09-12T09:00:00.000Z')
vi.setSystemTime(PINNED_TEST_TIME)
beforeEach(() => vi.setSystemTime(PINNED_TEST_TIME))
afterEach(() => vi.useRealTimers())

const TestRenderer = require('react-test-renderer')

type TestNode = {
  type: unknown
  props: Record<string, unknown>
  findAll: (predicate: (node: TestNode) => boolean) => TestNode[]
}

type TestTree = {
  root: TestNode
  unmount: () => void
}

const mocks = vi.hoisted(() => ({
  apiClient: vi.fn(),
  beginChallenge: vi.fn(),
  clearTiming: vi.fn(),
  logout: vi.fn(),
  markAttemptFailed: vi.fn(),
  markExhausted: vi.fn(),
  markVerified: vi.fn(),
  operation: 'delete',
  profile: {
    email: 'person@example.com',
    hasProAccess: false,
    planExpiresAt: null as string | null,
  },
  readTiming: vi.fn(),
  router: { replace: vi.fn() },
  sessionPhase: 'signed-in',
  userId: 'user-1',
  reducedMotion: false,
  
  flowCompleted: vi.fn(),
}))

vi.mock('@/lib/motion', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/motion')>()), usePrefersReducedMotion: () => mocks.reducedMotion }))

vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ operation: mocks.operation }),
  useRouter: () => mocks.router,
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: mocks.profile }) }))
vi.mock('@/lib/posthog', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/posthog')>(), captureGuidedFlowEvent: vi.fn(), captureGuidedFlowCompleted: mocks.flowCompleted }))
vi.mock('@/hooks/use-date-format', () => ({
  useDateFormat: () => ({ displayDate: (value: string) => `local:${value}`, displayDateNumeric: (value: string) => `numeric:${value}` }),
}))
vi.mock('@/hooks/use-logout', () => ({ useLogout: () => mocks.logout }))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: Object.assign(
    (selector: (state: unknown) => unknown) =>
      selector({ sessionPhase: mocks.sessionPhase, user: { email: 'session@example.com', userId: mocks.userId } }),
    { getState: () => ({ sessionPhase: mocks.sessionPhase, user: { email: 'session@example.com', userId: mocks.userId } }) },
  ),
}))
vi.mock('@/lib/api-client', () => ({
  apiClient: (...args: unknown[]) => mocks.apiClient(...args),
}))
vi.mock('@/lib/step-up-storage', () => ({
  beginStepUpChallenge: (operation: string, accountId: string | null) =>
    mocks.beginChallenge(operation, accountId),
  clearStepUpTiming: (operation: string, accountId: string | null) =>
    mocks.clearTiming(operation, accountId),
  markStepUpAttemptFailed: (record: unknown, accountId: string | null) =>
    mocks.markAttemptFailed(record, accountId),
  markStepUpExhausted: (record: unknown, accountId: string | null) =>
    mocks.markExhausted(record, accountId),
  markStepUpVerified: (operation: string) => mocks.markVerified(operation),
  readStepUpTiming: (operation: string, accountId: string | null) =>
    mocks.readTiming(operation, accountId),
}))
vi.mock('@/components/shell/flow-shell', () => ({
  FlowShell: ({ children, action }: Readonly<{ children: React.ReactNode; action?: React.ReactNode }>) =>
    React.createElement(
      'View',
      null,
      children,
      React.createElement('View', { testID: 'shell-action' }, action),
    ),
}))

const trees: TestTree[] = []

function flattenText(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.map(flattenText).join('')
  if (typeof value === 'object' && 'props' in value) {
    return flattenText((value as { props: { children?: unknown } }).props.children)
  }
  return ''
}

function liveRecord(offset = 0): StepUpTimingRecord {
  return { operation: 'delete' as const, sentAt: Date.now() - offset }
}

function backendError(errorCode: string, error: string) {
  return { data: { error, errorCode } }
}

function deferred<Value>() {
  let resolve!: (value: Value) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function replaceAccount() {
  await TestRenderer.act(async () => {
    mocks.userId = 'user-2'
    advanceAccountGeneration()
    await Promise.resolve()
  })
}

async function renderScreen(record: StepUpTimingRecord = liveRecord()) {
  mocks.readTiming.mockResolvedValue(record)
  let tree: TestTree | undefined
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(<StepUpScreen />)
    await Promise.resolve()
    await Promise.resolve()
  })
  trees.push(tree!)
  return tree!
}

function findInput(root: TestNode) {
  const input = root.findAll(
    (node) =>
      node.props.accessibilityLabel === 'stepUp.codeLabel' &&
      typeof node.props.onChangeText === 'function',
  ).at(0)
  if (!input) throw new Error('Expected the step up code input')
  return input
}

function queryButton(root: TestNode, label: string) {
  return root.findAll(
    (node) =>
      typeof node.props.onPress === 'function' && flattenText(node.props.children) === label,
  ).at(0)
}

function findButton(root: TestNode, label: string) {
  const button = queryButton(root, label)
  if (!button) throw new Error(`Expected button ${label}`)
  return button
}

function findText(root: TestNode, fragment: string) {
  return root.findAll((node) => flattenText(node.props.children).includes(fragment))
}

async function enterCode(tree: TestTree, code = '123456') {
  await TestRenderer.act(async () => {
    ;(findInput(tree.root).props.onChangeText as (value: string) => void)(code)
    await Promise.resolve()
  })
}

async function confirm(tree: TestTree) {
  await TestRenderer.act(async () => {
    ;(findButton(tree.root, 'stepUp.confirm').props.onPress as () => void)()
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('mobile step up screen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.sessionPhase = 'signed-in'
    mocks.userId = 'user-1'
    mocks.operation = 'delete'
    mocks.profile.email = 'person@example.com'
    mocks.profile.hasProAccess = false
    mocks.profile.planExpiresAt = null
    mocks.apiClient.mockImplementation((endpoint: string) => {
      if (endpoint === API.auth.confirmDeletion) {
        return Promise.resolve({
          message: 'Account deactivated',
          scheduledDeletionAt: '2026-09-04T03:00:00Z',
        })
      }
      return Promise.resolve({ message: 'Challenge accepted' })
    })
    mocks.beginChallenge.mockImplementation((operation: 'delete' | 'keys') => Promise.resolve({
      operation,
      sentAt: Date.now(),
    }))
    mocks.markExhausted.mockImplementation((
      record: { operation: 'delete'; sentAt: number },
    ) => Promise.resolve({ ...record, exhaustedAt: Date.now() }))
    mocks.markAttemptFailed.mockImplementation((record: StepUpTimingRecord) => Promise.resolve({
      ...record,
      failedAttempts: (record.failedAttempts ?? 0) + 1,
    }))
  })

  afterEach(async () => {
    await TestRenderer.act(async () => {
      trees.splice(0).forEach((tree) => tree.unmount())
      await Promise.resolve()
    })
  })

  const headings = (tree: TestTree) => tree.root.findAll((node) => node.type === 'Text' && node.props.accessibilityRole === 'header').map((node) => flattenText(node.props.children))
  const hostsWithTestId = (tree: TestTree, testID: string) => tree.root.findAll((node) => node.props.testID === testID && typeof node.type === 'string')
  const progressName = (tree: TestTree) => tree.root.findAll((node) => node.props.accessibilityRole === 'list' && typeof node.type === 'string')[0]?.props.accessibilityLabel
  const backArrow = (tree: TestTree, label: string) => tree.root.findAll((node) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function' && typeof node.type === 'string')[0]

  it('asks the code in the guided centred question layout with the flag on: the back arrow, the progress of the delete flow, one question and no eyebrow', async () => {
    const tree = await renderScreen()
    expect(hostsWithTestId(tree, 'guided-step-up')).toHaveLength(1)
    expect(hostsWithTestId(tree, 'question-flow-step-code')).toHaveLength(1)
    expect(headings(tree)).toEqual(['stepUp.codeLabel'])
    expect(findText(tree.root, 'stepUp.eyebrow')).toHaveLength(0)
    expect(progressName(tree)).toBe('habits.flow.progress:{"position":3,"total":3}')
    expect(findText(tree.root, 'stepUp.body:{"email":"person@example.com"}').length).toBeGreaterThan(0)
    expect(findText(tree.root, 'stepUp.neverShare').length).toBeGreaterThan(0)
    expect(hostsWithTestId(tree, 'shell-action')).toHaveLength(0)
    await TestRenderer.act(async () => { (backArrow(tree, 'common.back')!.props.onPress as () => void)(); await Promise.resolve() })
    expect(mocks.router.replace).toHaveBeenCalledWith('/profile/account')
  })

  it('counts the code of an API key as its own one-step progress with the flag on', async () => {
    mocks.operation = 'keys'
    const tree = await renderScreen({ operation: 'keys', sentAt: Date.now() })
    expect(progressName(tree)).toBe('habits.flow.progress:{"position":1,"total":1}')
    expect(hostsWithTestId(tree, 'question-flow-step-code')).toHaveLength(1)
  })

  it('shows the expired and exhausted states in the same guided frame with the flag on', async () => {
    const expired = await renderScreen(liveRecord(STEP_UP_CHALLENGE_DURATION_MS + 1000))
    expect(hostsWithTestId(expired, 'question-flow-step-expired')).toHaveLength(1)
    expect(headings(expired)).toEqual(['stepUp.expiredTitle'])
    expect(queryButton(expired.root, 'stepUp.resend')).toBeDefined()
    expect(queryButton(expired.root, 'stepUp.confirm')).toBeUndefined()
    const exhausted = await renderScreen({ ...liveRecord(), exhaustedAt: Date.now() })
    expect(hostsWithTestId(exhausted, 'question-flow-step-exhausted')).toHaveLength(1)
    expect(headings(exhausted)).toEqual(['stepUp.exhaustedTitle'])
    expect(hostsWithTestId(exhausted, 'button-primary-sm')).toHaveLength(0)
    const back = exhausted.root.findAll((node) => typeof node.props.accessibilityLabel === 'string' && /back/i.test(node.props.accessibilityLabel) && typeof node.props.onPress === 'function' && typeof node.type === 'string')[0]!
    await TestRenderer.act(async () => { (back.props.onPress as () => void)(); await Promise.resolve() })
    expect(mocks.router.replace).toHaveBeenCalledWith('/profile/account')
  })

  it('holds no mascot on the exhausted step with the flag on', async () => {
    const tree = await renderScreen({ ...liveRecord(), exhaustedAt: Date.now() })
    expect(findText(tree.root, 'stepUp.exhaustedTitle').length).toBeGreaterThan(0)
    expect(tree.root.findAll((node) => node.props.testID === 'orbit-mascot')).toHaveLength(0)
  })

  it.each([false, true])('closes the delete flow with the result dialog: Orbit in Parado, the date the server set, and sign out (Pro %s)', async (pro) => {
    mocks.profile.hasProAccess = pro
    const tree = await renderScreen()
    await enterCode(tree)
    await confirm(tree)
    const dialog = tree.root.findAll((node) => node.props.testID === 'result-dialog' && typeof node.type === 'string')[0]!
    expect(dialog.props.accessibilityLabel).toBe('result.title')
    expect(mocks.flowCompleted).toHaveBeenCalledExactlyOnceWith('delete_account', 3, false)
    expect(dialog.props.accessibilityHint).toBe(`result.account.${pro ? 'deletionScheduledPro' : 'deletionScheduled'}:{"date":"local:2026-09-04T03:00:00Z"}`)
    expect(dialog.findAll((node) => node.props.testID === 'orbit-mascot' && typeof node.type === 'string')[0]!.props['data-orbit-state' as never]).toBe('parado')
    await TestRenderer.act(async () => { (findButton(dialog, 'stepUp.signOut').props.onPress as () => void)(); await Promise.resolve() })
    expect(mocks.logout).toHaveBeenCalledOnce()

    const modal = tree.root.findAll((node) => typeof node.props.onRequestClose === 'function')[0]!
    await TestRenderer.act(async () => { (modal.props.onRequestClose as () => void)(); await Promise.resolve() })
    expect(tree.root.findAll((node) => node.props.testID === 'result-dialog')).toHaveLength(0)
    expect(tree.root.findAll((node) => node.props.testID === 'question-flow-step-done' && typeof node.type === 'string')).toHaveLength(1)
    expect(headings(tree)).toEqual(['stepUp.successTitle:{"date":"numeric:2026-09-04T03:00:00Z"}'])
    if (pro) expect(findText(tree.root, 'stepUp.successPro:{"date":"local:2026-09-04T03:00:00Z"}').length).toBeGreaterThan(0)
    await TestRenderer.act(async () => { (findButton(tree.root, 'stepUp.signOut').props.onPress as () => void)(); await Promise.resolve() })
    expect(mocks.logout).toHaveBeenCalledTimes(2)
  })

  it('keeps confirm enabled with the flag on, and answers a short code with the hint beside the field and a focus request', async () => {
    const tree = await renderScreen()
    const focusRequests = () => tree.root.findAll((node) => node.props.label === 'stepUp.codeLabel' && 'error' in node.props).map((node) => node.props.focusRequest)
    expect(findButton(tree.root, 'stepUp.confirm').props.disabled).toBeFalsy()
    await enterCode(tree, '12345')
    expect(findButton(tree.root, 'stepUp.confirm').props.disabled).toBeFalsy()
    await confirm(tree)
    expect(findText(tree.root, 'auth.errors.codeFormat').length).toBeGreaterThan(0)
    expect(focusRequests()).toContain(1)
    await confirm(tree)
    expect(focusRequests()).toContain(2)
    await enterCode(tree)
    expect(findText(tree.root, 'auth.errors.codeFormat')).toHaveLength(0)
  })

  it('keeps typed code when the session changes without an account change', async () => {
    const tree = await renderScreen()
    await enterCode(tree)

    await TestRenderer.act(async () => {
      advanceSessionEpoch()
      await Promise.resolve()
    })

    expect(findInput(tree.root).props.value).toBe('123456')
  })

  it('drops a typed code after the account changes, and a confirm press sends nothing', async () => {
    const tree = await renderScreen()
    await enterCode(tree)
    expect(findInput(tree.root).props.value).toBe('123456')

    await replaceAccount()

    expect(findInput(tree.root).props.value).toBe('')
    mocks.apiClient.mockClear()
    await confirm(tree)
    expect(mocks.apiClient).not.toHaveBeenCalled()
    expect(findText(tree.root, 'auth.errors.codeFormat').length).toBeGreaterThan(0)
  })

  it('drops the previous account deletion date after the account changes', async () => {
    const tree = await renderScreen()
    await enterCode(tree)
    await confirm(tree)
    const resultHints = () => tree.root.findAll((node) => node.props.testID === 'result-dialog' && typeof node.type === 'string').map((node) => node.props.accessibilityHint)
    expect(resultHints()).toEqual(['result.account.deletionScheduled:{"date":"local:2026-09-04T03:00:00Z"}'])

    await replaceAccount()

    expect(resultHints()).toEqual([])
    expect(findText(tree.root, 'numeric:2026-09-04T03:00:00Z')).toHaveLength(0)
    expect(findText(tree.root, 'local:2026-09-04T03:00:00Z')).toHaveLength(0)
    expect(findInput(tree.root).props.value).toBe('')
  })

  it('blocks editing and shows the confirm loading state while the code is checked', async () => {
    const pending = deferred<{ message: string; scheduledDeletionAt: string }>()
    mocks.apiClient.mockReturnValue(pending.promise)
    const tree = await renderScreen()
    await enterCode(tree)
    await confirm(tree)

    expect(findInput(tree.root).props.editable).toBe(false)
    const busy = tree.root.findAll((node) => typeof node.type === 'string' && (node.props.accessibilityState as { busy?: boolean } | undefined)?.busy === true)
    expect(busy.length).toBeGreaterThan(0)
    await TestRenderer.act(async () => { pending.resolve({ message: 'Account deactivated', scheduledDeletionAt: '2026-09-04T03:00:00Z' }); await pending.promise })
  })

  it('moves the third wrong code to exhausted and removes the forward controls', async () => {
    mocks.apiClient.mockRejectedValue(backendError('INVALID_VERIFICATION_CODE', 'Invalid code'))
    const tree = await renderScreen()
    await enterCode(tree)

    await confirm(tree)
    expect(mocks.markAttemptFailed).toHaveBeenCalledTimes(1)
    await confirm(tree)
    expect(mocks.markAttemptFailed).toHaveBeenCalledTimes(2)
    await confirm(tree)

    expect(findText(tree.root, 'stepUp.exhaustedNotice').length).toBeGreaterThan(0)
    expect(queryButton(tree.root, 'stepUp.confirm')).toBeUndefined()
    expect(queryButton(tree.root, 'stepUp.resend')).toBeUndefined()
  })

  it.each(['delete', 'keys'] as const)('mounts an active %s lock without requesting another code', async (operation) => {
    mocks.operation = operation
    const now = Date.now()
    const tree = await renderScreen({ operation, sentAt: now, exhaustedAt: now - STEP_UP_ATTEMPT_WINDOW_MS + 10_000 })
    expect(findText(tree.root, 'stepUp.exhaustedNotice').length).toBeGreaterThan(0)
    expect(queryButton(tree.root, 'stepUp.resend')).toBeUndefined()
    expect(mocks.apiClient).not.toHaveBeenCalled()
  })

  it('discards a pending key confirmation after the account changes', async () => {
    mocks.operation = 'keys'
    let resolveConfirmation: ((value: { message: string }) => void) | undefined
    mocks.apiClient.mockReturnValue(new Promise((resolve) => {
      resolveConfirmation = resolve
    }))
    const tree = await renderScreen({ operation: 'keys', sentAt: Date.now() })
    await enterCode(tree)
    await confirm(tree)

    await TestRenderer.act(async () => {
      mocks.userId = 'user-2'
      advanceAccountGeneration()
      await Promise.resolve()
    })
    await TestRenderer.act(async () => {
      resolveConfirmation?.({ message: 'confirmed' })
      await Promise.resolve()
    })

    expect(mocks.markVerified).not.toHaveBeenCalled()
    expect(mocks.router.replace).not.toHaveBeenCalled()
    expect(findInput(tree.root).props.value).toBe('')
  })

  it('discards a pending key confirmation when login starts before identity changes', async () => {
    mocks.operation = 'keys'
    let resolveConfirmation: ((value: { message: string }) => void) | undefined
    mocks.apiClient.mockReturnValue(new Promise((resolve) => {
      resolveConfirmation = resolve
    }))
    const tree = await renderScreen({ operation: 'keys', sentAt: Date.now() })
    await enterCode(tree)
    await confirm(tree)

    mocks.sessionPhase = 'establishing'
    await TestRenderer.act(async () => {
      resolveConfirmation?.({ message: 'confirmed' })
      await Promise.resolve()
    })

    expect(mocks.markVerified).not.toHaveBeenCalled()
    expect(mocks.router.replace).not.toHaveBeenCalled()
  })

  it.each(['delete', 'keys'] as const)(
    'stops a pending %s confirmation before clearing old account timing',
    async (operation) => {
      mocks.operation = operation
      const response = deferred<{ message: string; scheduledDeletionAt: string }>()
      mocks.apiClient.mockReturnValue(response.promise)
      const tree = await renderScreen({ operation, sentAt: Date.now() })
      await enterCode(tree)
      await confirm(tree)

      await replaceAccount()
      await TestRenderer.act(async () => {
        response.resolve({ message: 'confirmed', scheduledDeletionAt: '2026-09-04T03:00:00Z' })
        await response.promise
      })

      expect(mocks.clearTiming).not.toHaveBeenCalled()
      expect(mocks.markVerified).not.toHaveBeenCalled()
      expect(mocks.router.replace).not.toHaveBeenCalled()
      expect(findText(tree.root, 'local:2026-09-04T03:00:00Z')).toHaveLength(0)
    },
  )

  it.each(['delete', 'keys'] as const)(
    'stops a pending %s confirmation after clearing old account timing',
    async (operation) => {
      mocks.operation = operation
      const clearing = deferred<void>()
      mocks.clearTiming.mockReturnValue(clearing.promise)
      const tree = await renderScreen({ operation, sentAt: Date.now() })
      await enterCode(tree)
      await confirm(tree)
      expect(mocks.clearTiming).toHaveBeenCalledWith(operation, 'user-1')

      await replaceAccount()
      await TestRenderer.act(async () => {
        clearing.resolve()
        await clearing.promise
      })

      expect(mocks.markVerified).not.toHaveBeenCalled()
      expect(mocks.router.replace).not.toHaveBeenCalled()
      expect(findText(tree.root, 'local:2026-09-04T03:00:00Z')).toHaveLength(0)
    },
  )

  it.each(['delete', 'keys'] as const)(
    'ignores a failed %s confirmation after account replacement',
    async (operation) => {
      mocks.operation = operation
      const response = deferred<never>()
      mocks.apiClient.mockReturnValue(response.promise)
      const tree = await renderScreen({ operation, sentAt: Date.now() })
      await enterCode(tree)
      await confirm(tree)

      await replaceAccount()
      await TestRenderer.act(async () => {
        response.reject(backendError('INVALID_VERIFICATION_CODE', 'Invalid code'))
        await response.promise.catch(() => undefined)
      })

      expect(mocks.markAttemptFailed).not.toHaveBeenCalled()
      expect(findText(tree.root, 'stepUp.wrong')).toHaveLength(0)
      expect(findText(tree.root, 'stepUp.genericError')).toHaveLength(0)
    },
  )

  it('stops a pending resend before writing old account timing', async () => {
    const response = deferred<{ message: string }>()
    mocks.apiClient.mockReturnValue(response.promise)
    const tree = await renderScreen(liveRecord(60_000))
    await TestRenderer.act(async () => {
      ;(findButton(tree.root, 'stepUp.resend').props.onPress as () => void)()
      await Promise.resolve()
    })

    await replaceAccount()
    await TestRenderer.act(async () => {
      response.resolve({ message: 'sent' })
      await response.promise
    })

    expect(mocks.beginChallenge).not.toHaveBeenCalled()
    expect(findInput(tree.root).props.value).toBe('')
  })

  it('stops a pending resend after writing old account timing', async () => {
    const beginning = deferred<StepUpTimingRecord>()
    mocks.beginChallenge.mockReturnValue(beginning.promise)
    const tree = await renderScreen(liveRecord(60_000))
    await TestRenderer.act(async () => {
      ;(findButton(tree.root, 'stepUp.resend').props.onPress as () => void)()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(mocks.beginChallenge).toHaveBeenCalledWith('delete', 'user-1')

    await replaceAccount()
    await TestRenderer.act(async () => {
      beginning.resolve(liveRecord())
      await beginning.promise
    })

    expect(findButton(tree.root, 'stepUp.resend').props.disabled).not.toBe(true)
    expect(findText(tree.root, 'stepUp.cooldown')).toHaveLength(0)
  })

  it('ignores a failed resend after account replacement', async () => {
    const response = deferred<never>()
    mocks.apiClient.mockReturnValue(response.promise)
    const tree = await renderScreen(liveRecord(60_000))
    await TestRenderer.act(async () => {
      ;(findButton(tree.root, 'stepUp.resend').props.onPress as () => void)()
      await Promise.resolve()
    })

    await replaceAccount()
    await TestRenderer.act(async () => {
      response.reject(new Error('Network unavailable'))
      await response.promise.catch(() => undefined)
    })

    expect(findText(tree.root, 'stepUp.requestError')).toHaveLength(0)
    expect(findButton(tree.root, 'stepUp.resend').props.disabled).not.toBe(true)
  })

  it('does not start an old confirmation when login begins', async () => {
    const tree = await renderScreen()
    await enterCode(tree)
    const press = findButton(tree.root, 'stepUp.confirm').props.onPress as () => void
    mocks.sessionPhase = 'establishing'

    await TestRenderer.act(async () => {
      press()
      await Promise.resolve()
    })

    expect(mocks.apiClient).not.toHaveBeenCalled()
    expect(mocks.clearTiming).not.toHaveBeenCalled()
  })

  it('does not start an old resend when login begins', async () => {
    const tree = await renderScreen(liveRecord(60_000))
    const press = findButton(tree.root, 'stepUp.resend').props.onPress as () => void
    mocks.sessionPhase = 'establishing'

    await TestRenderer.act(async () => {
      press()
      await Promise.resolve()
    })

    expect(mocks.apiClient).not.toHaveBeenCalled()
    expect(mocks.beginChallenge).not.toHaveBeenCalled()
  })

  it('keeps a wrong code editable, rings every cell, and uses the server count', async () => {
    mocks.apiClient.mockRejectedValueOnce(
      backendError('INVALID_VERIFICATION_CODE', 'Invalid code. Remaining attempts: 2'),
    )
    const tree = await renderScreen()
    await enterCode(tree)
    await confirm(tree)

    expect(findInput(tree.root).props.editable).toBe(true)
    expect(findInput(tree.root).props.value).toBe('123456')
    expect(findText(tree.root, 'stepUp.attemptsMany:{"count":2}').length).toBeGreaterThan(0)
    for (let index = 0; index < 6; index += 1) {
      const cell = tree.root.findAll((node) => node.props.testID === `otp-cell-${index}`)[0]
      if (!cell) throw new Error(`Expected OTP cell ${index}`)
      const errorStyle = (cell.props.style as Record<string, unknown>[]).at(1)
      expect(errorStyle?.borderWidth).toBe(2)
    }
  })

  it.each([
    ['live', () => liveRecord()],
    ['exhausted', () => ({ operation: 'delete' as const, sentAt: Date.now(), exhaustedAt: Date.now() - STEP_UP_ATTEMPT_WINDOW_MS + 10_000 })],
  ] as const)('draws no Orbit in the %s step-up, because Orbit never sits inside a step-up', async (_state, record) => {
    const tree = await renderScreen(record())
    expect(tree.root.findAll((node) => node.props.testID === 'orbit-mascot')).toHaveLength(0)
  })

  it('shows the arrival cooldown with no resend control', async () => {
    const tree = await renderScreen()
    expect(findText(tree.root, 'stepUp.cooldown').length).toBeGreaterThan(0)
    expect(queryButton(tree.root, 'stepUp.resend')).toBeUndefined()
  })

  it('shows the ghost resend at zero and restarts the cooldown after sending', async () => {
    const tree = await renderScreen(liveRecord(60_000))
    expect(findButton(tree.root, 'stepUp.resend').props.testID).toBe('button-ghost-sm')

    await TestRenderer.act(async () => {
      ;(findButton(tree.root, 'stepUp.resend').props.onPress as () => void)()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mocks.apiClient).toHaveBeenCalledWith(
      API.auth.requestDeletion,
      { method: 'POST' },
      expect.anything(),
    )
    expect(mocks.beginChallenge).toHaveBeenCalledWith('delete', 'user-1')
    expect(findText(tree.root, 'stepUp.cooldown').length).toBeGreaterThan(0)
    expect(queryButton(tree.root, 'stepUp.resend')).toBeUndefined()
  })

  it('disables an expired code and uses one filled action for a new code', async () => {
    const tree = await renderScreen(liveRecord(STEP_UP_CHALLENGE_DURATION_MS))
    expect(findInput(tree.root).props.editable).toBe(false)
    expect(findButton(tree.root, 'stepUp.resend').props.testID).toBe('button-primary-sm')
    expect(queryButton(tree.root, 'stepUp.confirm')).toBeUndefined()
  })

  it('renders the endpoint date in device format and signs out', async () => {
    const tree = await renderScreen()
    await enterCode(tree)
    await confirm(tree)
    expect(findText(tree.root, 'local:2026-09-04T03:00:00Z').length).toBeGreaterThan(0)

    await TestRenderer.act(async () => {
      ;(findButton(tree.root, 'stepUp.signOut').props.onPress as () => void)()
      await Promise.resolve()
    })
    expect(mocks.logout).toHaveBeenCalledOnce()
  })

  it('renders the API scheduled deletion date in the Pro success line', async () => {
    mocks.profile.hasProAccess = true
    mocks.profile.planExpiresAt = '2026-08-30T03:00:00Z'
    const tree = await renderScreen()
    await enterCode(tree)
    await confirm(tree)
    expect(findText(tree.root, 'local:2026-09-04T03:00:00Z').length).toBeGreaterThan(0)
  })

  it('confirms API key creation in the guided frame and returns to its creation handoff, and never reports the verified code as a left flow', async () => {
    mocks.operation = 'keys'
    const tree = await renderScreen({ operation: 'keys', sentAt: Date.now() })
    expect(tree.root.findAll((node) => node.props.testID === 'guided-step-up' && typeof node.type === 'string')).toHaveLength(1)
    await enterCode(tree)
    await confirm(tree)
    expect(mocks.apiClient).toHaveBeenCalledWith(
      API.apiKeys.confirmCreationChallenge,
      { method: 'POST', body: JSON.stringify({ code: '123456' }) },
      expect.anything(),
    )
    expect(mocks.clearTiming).toHaveBeenCalledWith('keys', 'user-1')
    expect(mocks.markVerified).toHaveBeenCalledWith('keys')
    expect(mocks.router.replace).toHaveBeenCalledWith('/profile/ai')
    await TestRenderer.act(async () => {
      trees.splice(trees.indexOf(tree), 1)
      tree.unmount()
      await Promise.resolve()
    })
    const events = vi.mocked(captureGuidedFlowEvent).mock.calls.map(([event]) => event)
    expect(events).toContainEqual({ name: 'guided_flow_step_viewed', properties: { flow: 'api_key_create', step: 'code', step_count: 1 } })
    expect(events.filter((event) => event.name === 'guided_flow_abandoned')).toEqual([])
  })
})
