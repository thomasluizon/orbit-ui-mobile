import {
  apiKeyKeys,
  calendarKeys,
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
import { updateTimezoneRequestSchema, type Profile } from '@orbit/shared/types/profile'
import { apiClient } from './api-client'
import { getMutationResponseSchema } from './mutation-response-schemas'
import {
  accountTimezoneDependency,
  ACCOUNT_TIMEZONE_DEPENDENCY,
  count,
  enqueue,
  findUnfinalizedFirstWrite,
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
import AsyncStorage from '@react-native-async-storage/async-storage'
import { captureError } from './sentry'
import { useOfflineSyncStore } from '@/stores/offline-sync-store'
import type { HabitScheduleItem } from '@orbit/shared/types/habit'
import { ApiClientError, findHabitInList } from '@orbit/shared/utils'
export { accountTimezoneDependency, ACCOUNT_TIMEZONE_DEPENDENCY } from './offline-queue'

type InvalidationQueryKey = readonly unknown[]

const SCOPE_QUERY_KEYS: Record<MutationScope, readonly InvalidationQueryKey[]> = {
  habits: [habitKeys.all, goalKeys.all, profileKeys.all, gamificationKeys.all],
  goals: [goalKeys.all, habitKeys.lists()],
  tags: [tagKeys.all, habitKeys.lists(), habitKeys.searches()],
  notifications: [notificationKeys.all],
  profile: [profileKeys.all],
  apiKeys: [apiKeyKeys.all],
  calendar: [profileKeys.all],
}

export interface QueuedMarker {
  queued: true
  queuedMutationId: string
  retained?: true
}

export class OfflineMutationPreflightError extends Error {
  constructor() {
    super('Mutation requires an active connection')
    this.name = 'OfflineMutationPreflightError'
  }
}

const AUTOMATIC_REPLAY_BLOCKED_TYPES = new Set<string>([
  'bulkSkipHabits',
  'bulkLogHabits',
  'bulkCascadeDeleteHabits',
])

export function isAutomaticReplayBlocked(type: string): boolean {
  return AUTOMATIC_REPLAY_BLOCKED_TYPES.has(type)
}

export interface DroppedMutation {
  id: string
  type: string
  lastError: string | null
  mutation: PersistedQueuedMutation
  itemName?: string
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
  useOfflineSyncStore.getState().addDrop(dropped)
  captureError(new Error(`Offline mutation dropped: ${dropped.type}: ${dropped.lastError}`))
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
  queuedResultFactory?: (mutationId: string, retained: boolean) => TQueuedResult
}): Promise<TResult | TQueuedResult> {
  const builtMutation = buildQueuedMutation(mutation)

  return queueOrExecute<TResult, TResult | TQueuedResult>({
    mutation: builtMutation,
    execute,
    queuedResult,
    queuedResultFactory:
      queuedResultFactory ??
      (queuedResult === undefined
        ? (mutationId, retained) => createQueuedAck(mutationId, retained) as TResult | TQueuedResult
        : undefined),
  })
}

export function createQueuedAck(mutationId: string, retained = false): QueuedMarker {
  const marker: QueuedMarker = {
    queued: true,
    queuedMutationId: mutationId,
  }

  if (retained) marker.retained = true
  return marker
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

function getPayloadOfflineReferences(value: unknown, referenceField = false): string[] {
  if (typeof value === 'string') return referenceField && value.startsWith('offline-') ? [value] : []
  if (Array.isArray(value)) return value.flatMap((entry) => getPayloadOfflineReferences(entry, referenceField))
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, entry]) =>
      getPayloadOfflineReferences(entry, key === 'id' || key.endsWith('Id') || key.endsWith('Ids')),
    )
  }
  return []
}

function getPendingOfflineDependencies(mutation: PersistedQueuedMutation): string[] {
  return [
    mutation.targetEntityId ?? '',
    ...(mutation.dependsOn ?? []),
    ...mutation.endpoint.split('/'),
    ...getPayloadOfflineReferences(mutation.payload),
  ].filter((id) => id.startsWith('offline-'))
}

function releaseAccountTimezoneDependencies(timezoneMutationId: string): void {
  const dependency = accountTimezoneDependency(timezoneMutationId)
  for (const queued of getAll()) {
    if (!queued.dependsOn?.includes(dependency)) continue
    update(queued.id, { dependsOn: queued.dependsOn.filter((entry) => entry !== dependency) })
  }
}

export function hasPendingOfflineDependencies(mutation: PersistedQueuedMutation): boolean {
  return getPendingOfflineDependencies(mutation).length > 0
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
const DEPENDENCY_MAX_AGE_MS = 24 * 60 * 60 * 1000
const RECOVERY_KEY = '@orbit/offline-queue-recovery-310'

let installedQueueRecovered = false

function describeDroppedMutation(mutation: PersistedQueuedMutation, lastError: string): DroppedMutation {
  const dropped: DroppedMutation = { id: mutation.id, type: mutation.type, lastError, mutation }
  if (mutation.entityType === 'habit' && mutation.targetEntityId) {
    for (const [, habits] of queryClient.getQueriesData<HabitScheduleItem[]>({ queryKey: habitKeys.lists() })) {
      const habit = habits && findHabitInList(habits, mutation.targetEntityId)
      if (habit) {
        dropped.itemName = habit.title
        break
      }
    }
  }
  return dropped
}

async function recoverInstalledQueue(): Promise<void> {
  if (installedQueueRecovered) return
  let marker: string | null = null
  try {
    marker = await AsyncStorage.getItem(RECOVERY_KEY)
  } catch (error) {
    captureError(error)
  }
  if (marker === '1') {
    installedQueueRecovered = true
    return
  }
  for (const mutation of getAll()) {
    if (mutation.status === 'syncing') update(mutation.id, { status: 'pending' })
  }
  installedQueueRecovered = true
  try {
    await AsyncStorage.setItem(RECOVERY_KEY, '1')
  } catch (error) {
    captureError(error)
  }
}

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
  setReplayControlState({
    status: 'waiting-on-backoff',
    backoffAttempt: nextBackoffAttempt,
    timer,
  })
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

function isAuthRefreshNetworkError(error: unknown): boolean {
  return error instanceof TypeError && error.name === 'AuthRefreshNetworkError'
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
  if (error instanceof ApiClientError && (error.status === 401 || error.status === 403)) return true
  if (!(error instanceof Error)) return false

  const message = error.message.toLowerCase()
  return message.includes('unauthorized') || message.includes('forbidden')
}

const MUTATION_SCOPES = {
  createHabit: 'habits', updateHabit: 'habits', deleteHabit: 'habits', restoreHabit: 'habits',
  logHabit: 'habits', skipHabit: 'habits', reorderHabits: 'habits', updateChecklist: 'habits',
  duplicateHabit: 'habits', moveHabitParent: 'habits', createSubHabit: 'habits',
  bulkCreateHabits: 'habits', bulkDeleteHabits: 'habits', bulkCascadeDeleteHabits: 'habits',
  bulkLogHabits: 'habits', bulkSkipHabits: 'habits',
  createGoal: 'goals', updateGoal: 'goals', deleteGoal: 'goals', restoreGoal: 'goals',
  updateGoalProgress: 'goals', updateGoalStatus: 'goals', reorderGoals: 'goals', linkGoalHabits: 'goals',
  createTag: 'tags', updateTag: 'tags', deleteTag: 'tags', restoreTag: 'tags', assignTags: 'tags',
  markNotificationRead: 'notifications', markAllNotificationsRead: 'notifications',
  deleteNotification: 'notifications', deleteAllNotifications: 'notifications',
  createApiKey: 'apiKeys', deleteApiKey: 'apiKeys', dismissCalendarPrompt: 'calendar',
  setName: 'profile', setLanguage: 'profile', setWeekStartDay: 'profile', setColorScheme: 'profile',
  setThemePreference: 'profile', setTimeZone: 'profile', setAiSummary: 'profile',
  setProactiveAstra: 'profile', setMarketingConsent: 'profile', completeOnboarding: 'profile',
  dismissImportPrompt: 'profile', resetProfile: 'profile',
} satisfies Record<MutationType, MutationScope>

export function getMutationScope(type: string): MutationScope | undefined {
  const parsed = mutationTypeSchema.safeParse(type)
  if (!parsed.success) return undefined
  return MUTATION_SCOPES[parsed.data]
}

async function markQueuedMutation(mutation: QueuedMutation): Promise<string> {
  const queuedMutationId = enqueue(mutation)

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

  await persistQueryCache({ discardHabitSearches: mutation.scope === 'habits' || mutation.scope === 'tags' })
  return queuedMutationId
}

export async function queueOrExecute<TOnlineResult, TQueuedResult>({
  mutation,
  execute,
  queuedResult,
  queuedResultFactory,
  isCurrent,
}: {
  mutation: QueuedMutation
  execute: (resolvedMutation: QueuedMutation) => Promise<TOnlineResult>
  queuedResult?: TQueuedResult
  queuedResultFactory?: (mutationId: string, retained: boolean) => TQueuedResult
  isCurrent?: () => boolean
}): Promise<TOnlineResult | TQueuedResult> {
  const [resolvedMutation, online] = await Promise.all([
    resolveMutationReferences(mutation),
    getCurrentConnectivity(),
  ])
  if (isCurrent?.() === false) throw new Error('Mutation owner changed')
  const hasPendingDependencies = hasPendingOfflineDependencies(resolvedMutation)
  const retainedMutation = findUnfinalizedFirstWrite(resolvedMutation)

  if (
    (!online || hasPendingDependencies) &&
    isAutomaticReplayBlocked(resolvedMutation.type)
  ) {
    throw new OfflineMutationPreflightError()
  }

  if (retainedMutation) {
    return queuedResultFactory?.(retainedMutation.id, true) ?? queuedResult as TQueuedResult
  }

  if (!online || hasPendingDependencies) {
    const queuedMutationId = await markQueuedMutation(resolvedMutation)
    return queuedResultFactory?.(queuedMutationId, false) ?? queuedResult as TQueuedResult
  }

  try {
    setPendingIdempotencyKey(resolvedMutation.id)
    const result = await execute(resolvedMutation)
    if (resolvedMutation.type === 'setTimeZone') releaseAccountTimezoneDependencies(resolvedMutation.id)
    return result
  } catch (error: unknown) {
    if (!isTransientNetworkError(error) || isAutomaticReplayBlocked(resolvedMutation.type)) {
      throw error
    }

    if (isCurrent?.() === false) throw new Error('Mutation owner changed')
    const queuedMutationId = await markQueuedMutation(resolvedMutation)
    return queuedResultFactory?.(queuedMutationId, false) ?? queuedResult as TQueuedResult
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

function applySuccessfulProfileMutation(mutation: PersistedQueuedMutation): void {
  if (mutation.type !== 'setTimeZone') return
  const { timeZone } = updateTimezoneRequestSchema.parse(mutation.payload)
  queryClient.setQueryData<Profile>(profileKeys.detail(), (profile) =>
    profile ? { ...profile, timeZone } : profile,
  )
}

async function finalizeSuccessfulFlush(
  mutation: PersistedQueuedMutation,
  response: unknown,
  touchedScopes: Set<MutationScope>,
): Promise<void> {
  addTouchedScope(touchedScopes, mutation)
  applySuccessfulProfileMutation(mutation)
  if (mutation.type === 'setTimeZone') {
    releaseAccountTimezoneDependencies(mutation.id)
    await queryClient.cancelQueries({ queryKey: calendarKeys.all })
    await queryClient.invalidateQueries({ queryKey: calendarKeys.all })
  }
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
  if (shouldStopFlushing(error)) {
    update(mutation.id, { status: 'failed', lastError })
    if (mutation.entityType && mutation.clientEntityId) {
      await setOfflineEntityStatus(mutation.entityType, mutation.clientEntityId, 'failed', lastError)
    }
    return { incrementFailed: true, stopReason: 'auth', dropped: null }
  }
  const transientNetworkFailure = isTransientNetworkError(error)
  const nextRetries = isAuthRefreshNetworkError(error) ? mutation.retries : mutation.retries + 1
  const dropMutation = shouldDropMutation(error, nextRetries, mutation.maxRetries)
  let dropped: DroppedMutation | null = null

  if (dropMutation) {
    remove(mutation.id)
    addTouchedScope(touchedScopes, mutation)

    if (mutation.entityType && mutation.clientEntityId) {
      await clearOfflineEntity(mutation.entityType, mutation.clientEntityId)
    }

    dropped = describeDroppedMutation(mutation, lastError)
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
    stopReason: transientNetworkFailure ? 'network' : null,
    dropped,
  }
}

async function dropQueuedMutation(
  mutation: PersistedQueuedMutation,
  lastError: string,
  touchedScopes: Set<MutationScope>,
): Promise<DroppedMutation> {
  remove(mutation.id)
  addTouchedScope(touchedScopes, mutation)

  if (mutation.entityType && mutation.clientEntityId) {
    await clearOfflineEntity(mutation.entityType, mutation.clientEntityId)
  }

  return describeDroppedMutation(mutation, lastError)
}

async function invalidateTouchedScopes(scopes: Set<MutationScope>): Promise<void> {
  if (scopes.has('profile')) {
    await queryClient.invalidateQueries({ queryKey: profileKeys.all })
    await queryClient.invalidateQueries({ queryKey: gamificationKeys.all, refetchType: 'none' })
  }

  const invalidations: Promise<void>[] = []
  for (const scope of scopes) {
    if (scope === 'profile') continue
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

function hasExpiredOrphanDependency(mutation: PersistedQueuedMutation, dependencies: string[]): boolean {
  if (Date.now() - mutation.timestamp < DEPENDENCY_MAX_AGE_MS) return false
  const producers = getAll().filter((queued) => queued.id !== mutation.id && queued.clientEntityId)
  return dependencies.some((id) => !id.startsWith(`${ACCOUNT_TIMEZONE_DEPENDENCY}:`) && !producers.some((producer) => producer.clientEntityId === id))
}

async function processQueuedMutationFlush(
  originalMutation: PersistedQueuedMutation,
  touchedScopes: Set<MutationScope>,
): Promise<FlushStepResult> {
  const currentMutation = getById(originalMutation.id)
  if (!currentMutation) {
    return { failedDelta: 0, stopReason: null, succeededDelta: 0, dropped: null }
  }

  if (isAutomaticReplayBlocked(currentMutation.type)) {
    const dropped = await dropQueuedMutation(
      currentMutation,
      'Automatic replay is blocked for this mutation while offline',
      touchedScopes,
    )
    return { failedDelta: 1, stopReason: null, succeededDelta: 0, dropped }
  }

  const mutation = await resolveMutationReferences(currentMutation)
  const dependencies = getPendingOfflineDependencies(mutation)
  if (dependencies.length > 0) {
    if (hasExpiredOrphanDependency(mutation, dependencies)) {
      const dropped = await dropQueuedMutation(mutation, 'Unresolved dependency after 24 hours', touchedScopes)
      return { failedDelta: 1, stopReason: null, succeededDelta: 0, dropped }
    }
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
  const mutations = getAll()
  const pending = [...mutations]
  for (const mutation of mutations) {
    const dependencyIndex = pending.reduce((latest, entry, index) =>
      entry.type === 'setTimeZone' && mutation.dependsOn?.includes(accountTimezoneDependency(entry.id))
        ? Math.max(latest, index) : latest, -1)
    const currentIndex = pending.indexOf(mutation)
    if (dependencyIndex <= currentIndex) continue
    pending.splice(currentIndex, 1)
    pending.splice(dependencyIndex, 0, mutation)
  }

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
    if (!installedQueueRecovered) await recoverInstalledQueue()
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
