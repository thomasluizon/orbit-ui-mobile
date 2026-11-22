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
