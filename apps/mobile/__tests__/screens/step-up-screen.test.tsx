import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  STEP_UP_ATTEMPT_WINDOW_MS,
  STEP_UP_CHALLENGE_DURATION_MS,
  type StepUpTimingRecord,
} from '@orbit/shared/utils'
import { API } from '@orbit/shared/api'
import StepUpScreen from '@/app/step-up'

const TestRenderer = require('react-test-renderer')

type TestNode = {
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
  markExhausted: vi.fn(),
  operation: 'delete',
  profile: {
    email: 'person@example.com',
    hasProAccess: false,
    planExpiresAt: null as string | null,
  },
  readTiming: vi.fn(),
  router: { replace: vi.fn() },
}))

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
vi.mock('@/hooks/use-date-format', () => ({
  useDateFormat: () => ({ displayDate: (value: string) => `local:${value}` }),
}))
vi.mock('@/hooks/use-logout', () => ({ useLogout: () => mocks.logout }))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ user: { email: 'session@example.com' } }),
}))
vi.mock('@/lib/api-client', () => ({
  apiClient: (...args: unknown[]) => mocks.apiClient(...args),
}))
vi.mock('@/lib/step-up-storage', () => ({
  beginStepUpChallenge: (operation: string) => mocks.beginChallenge(operation),
  clearStepUpTiming: (operation: string) => mocks.clearTiming(operation),
  markStepUpExhausted: (record: unknown) => mocks.markExhausted(record),
  readStepUpTiming: (operation: string) => mocks.readTiming(operation),
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
  })

  afterEach(async () => {
    await TestRenderer.act(async () => {
      trees.splice(0).forEach((tree) => tree.unmount())
      await Promise.resolve()
    })
  })

  it('enables confirm only when all six digits are present', async () => {
    const tree = await renderScreen()
    expect(findButton(tree.root, 'stepUp.confirm').props.disabled).toBe(true)
    await enterCode(tree, '12345')
    expect(findButton(tree.root, 'stepUp.confirm').props.disabled).toBe(true)
    await enterCode(tree)
    expect(findButton(tree.root, 'stepUp.confirm').props.disabled).toBe(false)
  })

  it('blocks editing and exposes the confirm loading state while checking', async () => {
    let resolveConfirmation: ((value: { message: string; scheduledDeletionAt: string }) => void) | undefined
    mocks.apiClient.mockReturnValue(new Promise((resolve) => {
      resolveConfirmation = resolve
    }))
    const tree = await renderScreen()
    await enterCode(tree)
    await confirm(tree)

    expect(findInput(tree.root).props.editable).toBe(false)
    const busyAction = tree.root.findAll(
      (node) => node.props.testID === 'button-primary-md',
    ).at(0)
    if (!busyAction) throw new Error('Expected the busy shell action')
    expect(busyAction.props.accessibilityState).toEqual({
      disabled: true,
      busy: true,
    })
    resolveConfirmation?.({
      message: 'Account deactivated',
      scheduledDeletionAt: '2026-09-04T03:00:00Z',
    })
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

  it('moves the third wrong code to exhausted and removes forward controls', async () => {
    mocks.apiClient.mockRejectedValueOnce(
      backendError('INVALID_VERIFICATION_CODE', 'Invalid code. Remaining attempts: 0'),
    )
    const tree = await renderScreen()
    await enterCode(tree)
    await confirm(tree)

    expect(findText(tree.root, 'stepUp.exhaustedNotice').length).toBeGreaterThan(0)
    expect(findButton(tree.root, 'stepUp.backToProfile')).toBeDefined()
    expect(queryButton(tree.root, 'stepUp.confirm')).toBeUndefined()
    expect(queryButton(tree.root, 'stepUp.resend')).toBeUndefined()
    expect(queryButton(tree.root, 'stepUp.cancel')).toBeUndefined()
  })

  it('mounts an active lock without requesting another code', async () => {
    const now = Date.now()
    const tree = await renderScreen({
      operation: 'delete',
      sentAt: now,
      exhaustedAt: now - STEP_UP_ATTEMPT_WINDOW_MS + 10_000,
    })
    expect(findText(tree.root, 'stepUp.exhaustedNotice').length).toBeGreaterThan(0)
    expect(queryButton(tree.root, 'stepUp.resend')).toBeUndefined()
    expect(mocks.apiClient).not.toHaveBeenCalled()
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
    expect(mocks.beginChallenge).toHaveBeenCalledWith('delete')
    expect(findText(tree.root, 'stepUp.cooldown').length).toBeGreaterThan(0)
    expect(queryButton(tree.root, 'stepUp.resend')).toBeUndefined()
  })

  it('disables an expired code and uses one filled action for a new code', async () => {
    const tree = await renderScreen(liveRecord(STEP_UP_CHALLENGE_DURATION_MS))
    expect(findInput(tree.root).props.editable).toBe(false)
    expect(findButton(tree.root, 'stepUp.resend').props.testID).toBe('button-primary-md')
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

  it('renders the Pro plan end date as a second success line', async () => {
    mocks.profile.hasProAccess = true
    mocks.profile.planExpiresAt = '2026-08-30T03:00:00Z'
    const tree = await renderScreen()
    await enterCode(tree)
    await confirm(tree)
    expect(findText(tree.root, 'local:2026-08-30T03:00:00Z').length).toBeGreaterThan(0)
  })

  it('routes cancel to Profile', async () => {
    const tree = await renderScreen()
    await TestRenderer.act(async () => {
      ;(findButton(tree.root, 'stepUp.cancel').props.onPress as () => void)()
      await Promise.resolve()
    })
    expect(mocks.router.replace).toHaveBeenCalledWith('/profile')
  })

  it('confirms API key creation and returns to its creation handoff', async () => {
    mocks.operation = 'keys'
    const tree = await renderScreen({ operation: 'keys', sentAt: Date.now() })
    await enterCode(tree)
    await confirm(tree)
    expect(mocks.apiClient).toHaveBeenCalledWith(
      API.apiKeys.confirmCreationChallenge,
      { method: 'POST', body: JSON.stringify({ code: '123456' }) },
      expect.anything(),
    )
    expect(mocks.clearTiming).toHaveBeenCalledWith('keys')
    expect(mocks.router.replace).toHaveBeenCalledWith('/advanced?create-key=1')
  })
})
