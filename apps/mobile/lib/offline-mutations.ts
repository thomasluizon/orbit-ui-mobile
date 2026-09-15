import {
  apiKeyKeys,
  gamificationKeys,
  goalKeys,
  habitKeys,
  notificationKeys,
  profileKeys,
  tagKeys,
} from '@orbit/shared/query'
import type {
  MutationEntityType,
  MutationScope,
  MutationType,
  PersistedQueuedMutation,
  QueuedMutation,
} from '@orbit/shared/types/sync'
import { mutationTypeSchema } from '@orbit/shared/types/sync'
import { apiClient } from './api-client'
import { getMutationResponseSchema } from './mutation-response-schemas'
import {
  count,
  enqueue,
  getAll,
  getById,
  remove,
  replaceEntityReferences,
  update,
} from './offline-queue'
import { clearOfflineEntity, getResolvedEntityId, markOfflineTombstone, resolveOfflineEntity, setOfflineEntityStatus, upsertOfflineEntity } from './offline-state'
import { getCurrentConnectivity } from './offline-runtime'
import { setPendingIdempotencyKey } from './idempotency-key'
import { persistQueryCache, queryClient } from './query-client'
import { captureError } from './sentry'

type InvalidationQueryKey = readonly unknown[]

const SCOPE_QUERY_KEYS: Record<MutationScope, readonly InvalidationQueryKey[]> = {
  habits: [habitKeys.all, goalKeys.all, profileKeys.all, gamificationKeys.all],
  goals: [goalKeys.all, habitKeys.lists()],
  tags: [tagKeys.all, habitKeys.lists()],
  notifications: [notificationKeys.all],
  profile: [profileKeys.all],
  apiKeys: [apiKeyKeys.all],
  calendar: [profileKeys.all],
}

export interface QueuedMarker {
  queued: true
  queuedMutationId: string
}

export interface DroppedMutation {
  id: string
  type: string
  lastError: string | null
}

export type OfflineReplayState = 'idle' | 'flushing' | 'waiting-on-backoff' | 'stopped-for-auth'

export interface OfflineFlushResult {
  succeeded: number
  failed: number
  remaining: number
  droppedMutations: DroppedMutation[]
  replayState: OfflineReplayState
}

type DroppedMutationListener = (dropped: DroppedMutation) => void
type FlushResultListener = (result: OfflineFlushResult) => void

const droppedMutationListeners = new Set<DroppedMutationListener>()
const flushResultListeners = new Set<FlushResultListener>()

/**
 * Subscribe to mutations dropped from the queue (permanent/validation errors or
 * retry exhaustion). Fires for EVERY flush path — the foreground flush and the
 * decoupled backoff retry — so a drop is never surfaced only when a UI-driven
 * flush happens to discover it. Returns an unsubscribe function.
 */
export function subscribeDroppedMutations(listener: DroppedMutationListener): () => void {
  droppedMutationListeners.add(listener)
  return () => {
    droppedMutationListeners.delete(listener)
  }
}

function notifyDroppedMutation(dropped: DroppedMutation): void {
  for (const listener of droppedMutationListeners) listener(dropped)
}

export function subscribeFlushResults(listener: FlushResultListener): () => void {
  flushResultListeners.add(listener)
  return () => {
    flushResultListeners.delete(listener)
  }
}

function notifyFlushResult(result: OfflineFlushResult): void {
  for (const listener of flushResultListeners) listener(result)
}

export interface QueuedMutationBuildOptions {
  type: MutationType
  scope: MutationScope
  endpoint: string
  method: 'POST' | 'PUT' | 'DELETE'
  payload: unknown
  entityType?: MutationEntityType
  dedupeKey?: string | null
  targetEntityId?: string | null
  clientEntityId?: string | null
  dependsOn?: string[]
  maxRetries?: number
}

let queuedMutationSequence = 0

export function isQueuedResult(value: unknown): value is QueuedMarker {
  return (
    typeof value === 'object' &&
    value !== null &&
    'queued' in value &&
    (value as { queued?: boolean }).queued === true
  )
}

export function createTempEntityId(entityType: MutationEntityType): string {
  return nextQueuedIdentifier(`offline-${entityType}`)
}

export function buildQueuedMutation({
  type,
  scope,
  endpoint,
  method,
  payload,
  entityType,
  dedupeKey = null,
  targetEntityId = null,
  clientEntityId = null,
  dependsOn = [],
  maxRetries = 3,
}: QueuedMutationBuildOptions): QueuedMutation {
  return {
    id: nextQueuedIdentifier('offline-mutation'),
    timestamp: Date.now(),
    type,
    scope,
    endpoint,
    method,
    payload,
    retries: 0,
    maxRetries,
    entityType,
    status: 'pending',
    dedupeKey,
    targetEntityId,
    clientEntityId,
    dependsOn,
    lastError: null,
  }
}

export async function runQueuedMutation<TResult, TQueuedResult = TResult | QueuedMarker>({
  mutation,
  execute,
  queuedResult,
  queuedResultFactory,
}: {
  mutation: QueuedMutationBuildOptions
  execute: (resolvedMutation: QueuedMutation) => Promise<TResult>
  queuedResult?: TResult
  queuedResultFactory?: (mutationId: string) => TQueuedResult
}): Promise<TResult | TQueuedResult> {
  const builtMutation = buildQueuedMutation(mutation)
  const resolvedQueuedResult =
    queuedResultFactory?.(builtMutation.id) ?? queuedResult ?? createQueuedAck(builtMutation.id)

  return queueOrExecute({
    mutation: builtMutation,
    execute,
    queuedResult: resolvedQueuedResult as TResult | TQueuedResult,
  })
}

export function createQueuedAck(mutationId: string): QueuedMarker {
  return {
    queued: true,
    queuedMutationId: mutationId,
  }
}

export function withQueuedMarker<T extends Record<string, unknown>>(
  value: T,
  mutationId: string,
): T & QueuedMarker {
  return {
    ...value,
    queued: true,
    queuedMutationId: mutationId,
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown offline sync error'
}

function nextQueuedIdentifier(prefix: string): string {
  queuedMutationSequence += 1
  return `${prefix}-${Date.now()}-${queuedMutationSequence.toString(36)}`
}

const OFFLINE_ID_PATTERN = /\boffline-[a-z]+-[a-z0-9-]+\b/g

function collectOfflineIds(value: unknown, ids: Set<string>): void {
  if (typeof value === 'string') {
    for (const match of value.matchAll(OFFLINE_ID_PATTERN)) {
      if (match[0]) {
        ids.add(match[0])
      }
    }
    return
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectOfflineIds(entry, ids)
    }
    return
  }

  if (value && typeof value === 'object') {
    for (const entry of Object.values(value as Record<string, unknown>)) {
      collectOfflineIds(entry, ids)
    }
  }
}

function hasPendingOfflineDependencies(mutation: PersistedQueuedMutation): boolean {
  const pendingIds = new Set<string>()

  if (mutation.targetEntityId?.startsWith('offline-')) {
    pendingIds.add(mutation.targetEntityId)
  }

  for (const dependencyId of mutation.dependsOn ?? []) {
    if (dependencyId.startsWith('offline-')) {
      pendingIds.add(dependencyId)
    }
  }

  collectOfflineIds(mutation.endpoint, pendingIds)
  collectOfflineIds(mutation.payload, pendingIds)

  return pendingIds.size > 0
}

function replaceIdInValue(value: unknown, oldId: string, newId: string): unknown {
  if (value === oldId) return newId

  if (Array.isArray(value)) {
    return value.map((entry) => replaceIdInValue(entry, oldId, newId))
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        replaceIdInValue(entry, oldId, newId),
      ]),
    )
  }

  if (typeof value === 'string' && value.includes(oldId)) {
    return value.split(oldId).join(newId)
  }

  return value
}

function rewriteMutationIdReferences<T extends PersistedQueuedMutation>(mutation: T, oldId: string, newId: string): T {
  return {
    ...mutation,
    endpoint: mutation.endpoint.includes(oldId)
      ? mutation.endpoint.split(oldId).join(newId)
      : mutation.endpoint,
    payload: replaceIdInValue(mutation.payload, oldId, newId),
    targetEntityId: mutation.targetEntityId === oldId ? newId : mutation.targetEntityId,
    clientEntityId: mutation.clientEntityId === oldId ? newId : mutation.clientEntityId,
    dependsOn: mutation.dependsOn?.map((id) => (id === oldId ? newId : id)) ?? [],
  }
}

async function resolveMutationReferences<T extends PersistedQueuedMutation>(mutation: T): Promise<T> {
  if (!mutation.entityType || !mutation.targetEntityId) return mutation

  const resolvedId = await getResolvedEntityId(mutation.entityType, mutation.targetEntityId)
  if (resolvedId === mutation.targetEntityId) return mutation

  return rewriteMutationIdReferences(mutation, mutation.targetEntityId, resolvedId)
}

const BACKOFF_BASE_DELAY_MS = 2_000
const BACKOFF_MAX_DELAY_MS = 60_000

type ReplayControlState =
  | { status: 'idle'; backoffAttempt: number }
  | { status: 'flushing'; backoffAttempt: number; cancelled: boolean }
  | { status: 'waiting-on-backoff'; backoffAttempt: number; timer: ReturnType<typeof setTimeout> }
  | { status: 'stopped-for-auth' }

type ReplayStateListener = (state: OfflineReplayState) => void

let replayControlState: ReplayControlState = { status: 'idle', backoffAttempt: 0 }
const replayStateListeners = new Set<ReplayStateListener>()

function setReplayControlState(state: ReplayControlState): void {
  replayControlState = state
  for (const listener of replayStateListeners) listener(state.status)
}

export function getReplayState(): OfflineReplayState {
  return replayControlState.status
}

export function subscribeReplayState(listener: ReplayStateListener): () => void {
  replayStateListeners.add(listener)
  listener(replayControlState.status)
  return () => {
    replayStateListeners.delete(listener)
  }
}

export function canAutoFlush(): boolean {
  return replayControlState.status === 'idle'
}

function computeBackoffDelay(attempt: number): number {
  return Math.min(BACKOFF_BASE_DELAY_MS * 2 ** attempt, BACKOFF_MAX_DELAY_MS)
}

function getBackoffAttempt(): number {
  return replayControlState.status === 'stopped-for-auth'
    ? 0
    : replayControlState.backoffAttempt
}

function wasFlushCancelled(): boolean {
  return replayControlState.status === 'flushing' && replayControlState.cancelled
}

/**
 * Cancels any scheduled offline-queue retry and resets backoff state. Call when
 * the session is torn down or replaced so a pending retry never fires against a
 * cleared queue or a different account.
 */
export function cancelScheduledFlush(): void {
  if (replayControlState.status === 'waiting-on-backoff') {
    clearTimeout(replayControlState.timer)
  }
  if (replayControlState.status === 'flushing') {
    setReplayControlState({ ...replayControlState, cancelled: true })
    return
  }
  setReplayControlState({ status: 'idle', backoffAttempt: 0 })
}

export function resumeOfflineReplay(): void {
  if (replayControlState.status === 'stopped-for-auth') {
    setReplayControlState({ status: 'idle', backoffAttempt: 0 })
  }
}

function ownsBackoffTimer(timer: ReturnType<typeof setTimeout>): boolean {
  return replayControlState.status === 'waiting-on-backoff' && replayControlState.timer === timer
}

function scheduleBackoffFlush(replaceTimer?: ReturnType<typeof setTimeout>): void {
  if (
    replayControlState.status === 'waiting-on-backoff' &&
    replayControlState.timer !== replaceTimer
  ) return

  const backoffAttempt = getBackoffAttempt()
  const delay = computeBackoffDelay(backoffAttempt)
  const nextBackoffAttempt = Math.min(backoffAttempt + 1, 5)
  const timer = setTimeout(() => {
    if (!ownsBackoffTimer(timer)) return
    void (async () => {
      if (count() === 0) {
        cancelScheduledFlush()
        return
      }
      const isOnline = await getCurrentConnectivity()
      if (!ownsBackoffTimer(timer)) return
      if (!isOnline) {
        scheduleBackoffFlush(timer)
        return
      }
      await flushQueuedMutations()
    })().catch(captureError)
  }, delay)
  setReplayControlState({ status: 'waiting-on-backoff', backoffAttempt: nextBackoffAttempt, timer })
}

function isTransientNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true
  if (!(error instanceof Error)) return false

  const message = error.message.toLowerCase()
  return (
    message.includes('network request failed') ||
    message.includes('network error') ||
    message.includes('failed to fetch') ||
    message.includes('fetch failed') ||
    message.includes('load failed') ||
    message.includes('timed out')
  )
}

function shouldDropMutation(error: unknown, nextRetries: number, maxRetries: number): boolean {
  if (!(error instanceof Error)) return nextRetries >= maxRetries

  const message = error.message.toLowerCase()
  if (nextRetries >= maxRetries) return true

  return (
    message.includes('404') ||
    message.includes('409') ||
    message.includes('410') ||
    message.includes('400') ||
    message.includes('validation')
  )
}

function shouldStopFlushing(error: unknown): boolean {
  if (!(error instanceof Error)) return false

  const message = error.message.toLowerCase()
  return message.includes('unauthorized') || message.includes('forbidden')
}

export function getMutationScope(type: string): MutationScope | undefined {
  switch (type) {
    case 'createGoal':
    case 'updateGoal':
    case 'deleteGoal':
    case 'updateGoalProgress':
    case 'updateGoalStatus':
    case 'reorderGoals':
    case 'linkGoalHabits':
      return 'goals'
    case 'createTag':
    case 'updateTag':
    case 'deleteTag':
    case 'assignTags':
      return 'tags'
    case 'markNotificationRead':
    case 'markAllNotificationsRead':
    case 'deleteNotification':
    case 'deleteAllNotifications':
      return 'notifications'
    case 'createApiKey':
    case 'deleteApiKey':
      return 'apiKeys'
    case 'dismissCalendarPrompt':
      return 'calendar'
    case 'setLanguage':
    case 'setWeekStartDay':
    case 'setColorScheme':
    case 'setThemePreference':
    case 'setTimeZone':
    case 'setAiSummary':
    case 'setProactiveAstra':
    case 'setMarketingConsent':
    case 'completeOnboarding':
    case 'dismissImportPrompt':
    case 'resetProfile':
      return 'profile'
    default:
      return mutationTypeSchema.safeParse(type).success ? 'habits' : undefined
  }
}

async function markQueuedMutation(mutation: QueuedMutation): Promise<void> {
  enqueue(mutation)

  if (mutation.entityType && mutation.clientEntityId) {
    await upsertOfflineEntity({
      entityType: mutation.entityType,
      tempId: mutation.clientEntityId,
      serverId: null,
      status: 'pending',
      tombstone: false,
      updatedAt: Date.now(),
      lastError: null,
    })
  }

  if (mutation.entityType && mutation.targetEntityId && mutation.type.startsWith('delete')) {
    await markOfflineTombstone(mutation.entityType, mutation.targetEntityId, true)
  }

  await persistQueryCache()
}

export async function queueOrExecute<TOnlineResult, TQueuedResult>({
  mutation,
  execute,
  queuedResult,
}: {
  mutation: QueuedMutation
  execute: (resolvedMutation: QueuedMutation) => Promise<TOnlineResult>
  queuedResult: TQueuedResult
}): Promise<TOnlineResult | TQueuedResult> {
  const [resolvedMutation, online] = await Promise.all([
    resolveMutationReferences(mutation),
    getCurrentConnectivity(),
  ])
  const hasPendingDependencies = hasPendingOfflineDependencies(resolvedMutation)

  if (!online || hasPendingDependencies) {
    await markQueuedMutation(resolvedMutation)
    return queuedResult
  }

  try {
    setPendingIdempotencyKey(resolvedMutation.id)
    return await execute(resolvedMutation)
  } catch (error: unknown) {
    if (!isTransientNetworkError(error)) {
      throw error
    }

    await markQueuedMutation(resolvedMutation)
    return queuedResult
  } finally {
    setPendingIdempotencyKey(null)
  }
}

function extractCreatedEntityId(response: unknown): string | null {
  if (!response || typeof response !== 'object') return null

  if ('id' in response && typeof response.id === 'string') {
    return response.id
  }

  return null
}

function serializeMutationPayload(payload: unknown): string | undefined {
  return payload === undefined || payload === null ? undefined : JSON.stringify(payload)
}

function addTouchedScope(
  touchedScopes: Set<MutationScope>,
  mutation: PersistedQueuedMutation,
): void {
  const scope = mutation.scope ?? getMutationScope(mutation.type)
  if (scope) touchedScopes.add(scope)
}

async function clearCreatedOfflineEntity(
  mutation: PersistedQueuedMutation,
  response: unknown,
): Promise<void> {
  if (!mutation.entityType || !mutation.clientEntityId) return

  const serverId = extractCreatedEntityId(response)
  if (serverId && serverId !== mutation.clientEntityId) {
    await resolveOfflineEntity(mutation.entityType, mutation.clientEntityId, serverId)
    replaceEntityReferences(mutation.clientEntityId, serverId)
    return
  }

  await clearOfflineEntity(mutation.entityType, mutation.clientEntityId)
}

async function clearDeletedOfflineEntity(mutation: PersistedQueuedMutation): Promise<void> {
  if (!mutation.entityType || !mutation.targetEntityId || !mutation.type.startsWith('delete')) {
    return
  }

  await clearOfflineEntity(mutation.entityType, mutation.targetEntityId)
}

async function finalizeSuccessfulFlush(
  mutation: PersistedQueuedMutation,
  response: unknown,
  touchedScopes: Set<MutationScope>,
): Promise<void> {
  addTouchedScope(touchedScopes, mutation)
  await clearCreatedOfflineEntity(mutation, response)
  await clearDeletedOfflineEntity(mutation)
  remove(mutation.id)
}

async function markMutationSyncing(mutation: PersistedQueuedMutation): Promise<void> {
  update(mutation.id, { status: 'syncing', lastError: null })

  if (mutation.entityType && mutation.clientEntityId) {
    await setOfflineEntityStatus(mutation.entityType, mutation.clientEntityId, 'syncing')
  }
}

type FlushStopReason = 'network' | 'auth' | null

async function handleFlushFailure(
  mutation: PersistedQueuedMutation,
  error: unknown,
  touchedScopes: Set<MutationScope>,
): Promise<{
  incrementFailed: boolean
  stopReason: FlushStopReason
  dropped: DroppedMutation | null
}> {
  const lastError = getErrorMessage(error)
  const transientNetworkFailure = isTransientNetworkError(error)
  const nextRetries = mutation.retries + 1
  const dropMutation = shouldDropMutation(error, nextRetries, mutation.maxRetries)
  let dropped: DroppedMutation | null = null

  if (dropMutation) {
    remove(mutation.id)
    addTouchedScope(touchedScopes, mutation)

    if (mutation.entityType && mutation.clientEntityId) {
      await clearOfflineEntity(mutation.entityType, mutation.clientEntityId)
    }

    dropped = { id: mutation.id, type: mutation.type, lastError }
  } else {
    update(mutation.id, {
      retries: nextRetries,
      status: 'failed',
      lastError,
    })

    if (mutation.entityType && mutation.clientEntityId) {
      await setOfflineEntityStatus(
        mutation.entityType,
        mutation.clientEntityId,
        'failed',
        lastError,
      )
    }
  }

  return {
    incrementFailed: !transientNetworkFailure || dropped !== null,
    stopReason: shouldStopFlushing(error)
      ? 'auth'
      : transientNetworkFailure
        ? 'network'
        : null,
    dropped,
  }
}

async function invalidateTouchedScopes(scopes: Set<MutationScope>): Promise<void> {
  const invalidations: Promise<void>[] = []
  for (const scope of scopes) {
    for (const queryKey of SCOPE_QUERY_KEYS[scope]) {
      invalidations.push(queryClient.invalidateQueries({ queryKey }))
    }
  }
  await Promise.all(invalidations)
}

type FlushStepResult = {
  failedDelta: number
  stopReason: FlushStopReason
  succeededDelta: number
  dropped: DroppedMutation | null
}

async function processQueuedMutationFlush(
  originalMutation: PersistedQueuedMutation,
  touchedScopes: Set<MutationScope>,
): Promise<FlushStepResult> {
  const currentMutation = getById(originalMutation.id)
  if (!currentMutation) {
    return { failedDelta: 0, stopReason: null, succeededDelta: 0, dropped: null }
  }

  const mutation = await resolveMutationReferences(currentMutation)
  if (hasPendingOfflineDependencies(mutation)) {
    update(mutation.id, { status: 'pending', lastError: null })
    return { failedDelta: 0, stopReason: null, succeededDelta: 0, dropped: null }
  }

  await markMutationSyncing(mutation)

  try {
    const response = await apiClient<unknown>(
      mutation.endpoint,
      {
        method: mutation.method,
        body: serializeMutationPayload(mutation.payload),
        idempotencyKey: mutation.id,
      },
      getMutationResponseSchema(mutation.type),
    )

    await finalizeSuccessfulFlush(mutation, response, touchedScopes)
    return { failedDelta: 0, stopReason: null, succeededDelta: 1, dropped: null }
  } catch (error: unknown) {
    const failure = await handleFlushFailure(mutation, error, touchedScopes)
    return {
      failedDelta: failure.incrementFailed ? 1 : 0,
      stopReason: failure.stopReason,
      succeededDelta: 0,
      dropped: failure.dropped,
    }
  }
}

type FlushOutcome = {
  succeeded: number
  failed: number
  remaining: number
  stopReason: FlushStopReason
  droppedMutations: DroppedMutation[]
}

async function runQueueFlush(): Promise<FlushOutcome> {
  let succeeded = 0
  let failed = 0
  let stopReason: FlushStopReason = null
  const droppedMutations: DroppedMutation[] = []
  const touchedScopes = new Set<MutationScope>()
  const pending = getAll()

  for (const originalMutation of pending) {
    const step = await processQueuedMutationFlush(originalMutation, touchedScopes)
    succeeded += step.succeededDelta
    failed += step.failedDelta
    if (step.dropped) {
      droppedMutations.push(step.dropped)
      notifyDroppedMutation(step.dropped)
    }
    if (step.stopReason) {
      stopReason = step.stopReason
      break
    }
  }

  await invalidateTouchedScopes(touchedScopes)
  await persistQueryCache()

  return { succeeded, failed, remaining: count(), stopReason, droppedMutations }
}

export async function flushQueuedMutations(): Promise<OfflineFlushResult> {
  if (replayControlState.status === 'flushing') {
    return {
      succeeded: 0,
      failed: 0,
      remaining: count(),
      droppedMutations: [],
      replayState: 'flushing',
    }
  }

  if (replayControlState.status === 'waiting-on-backoff') {
    clearTimeout(replayControlState.timer)
  }
  const backoffAttempt = getBackoffAttempt()
  setReplayControlState({ status: 'flushing', backoffAttempt, cancelled: false })
  let outcome: FlushOutcome
  try {
    outcome = await runQueueFlush()
  } catch (error: unknown) {
    if (wasFlushCancelled()) {
      setReplayControlState({ status: 'idle', backoffAttempt: 0 })
    } else if (count() > 0) {
      scheduleBackoffFlush()
    } else {
      setReplayControlState({ status: 'idle', backoffAttempt: 0 })
    }
    throw error
  }

  const drained = outcome.succeeded + outcome.droppedMutations.length
  if (wasFlushCancelled()) {
    setReplayControlState({ status: 'idle', backoffAttempt: 0 })
  } else if (outcome.stopReason === 'auth') {
    setReplayControlState({ status: 'stopped-for-auth' })
  } else if (outcome.remaining > 0 && (outcome.stopReason === 'network' || drained === 0)) {
    scheduleBackoffFlush()
  } else {
    setReplayControlState({ status: 'idle', backoffAttempt: 0 })
  }

  const result: OfflineFlushResult = {
    succeeded: outcome.succeeded,
    failed: outcome.failed,
    remaining: outcome.remaining,
    droppedMutations: outcome.droppedMutations,
    replayState: replayControlState.status,
  }
  notifyFlushResult(result)
  return result
}
