import {
  apiKeyKeys,
  gamificationKeys,
  goalKeys,
  habitKeys,
  notificationKeys,
  profileKeys,
  tagKeys,
  userFactKeys,
} from '@orbit/shared/query'
import type {
  MutationEntityType,
  MutationScope,
  MutationType,
  QueuedMutation,
} from '@orbit/shared/types/sync'
import { apiClient } from './api-client'
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
import { persistQueryCache, queryClient } from './query-client'

type InvalidationQueryKey = readonly unknown[]

const SCOPE_QUERY_KEYS: Record<MutationScope, ReadonlyArray<InvalidationQueryKey>> = {
  habits: [habitKeys.all, goalKeys.all, profileKeys.all, gamificationKeys.all],
  goals: [goalKeys.all, habitKeys.lists()],
  tags: [tagKeys.all, habitKeys.lists()],
  notifications: [notificationKeys.all],
  profile: [profileKeys.all],
  userFacts: [userFactKeys.all],
  apiKeys: [apiKeyKeys.all],
  calendar: [profileKeys.all],
}

export interface QueuedMarker {
  queued: true
  queuedMutationId: string
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

function hasPendingOfflineDependencies(mutation: QueuedMutation): boolean {
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

function rewriteMutationIdReferences(mutation: QueuedMutation, oldId: string, newId: string): QueuedMutation {
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

async function resolveMutationReferences(mutation: QueuedMutation): Promise<QueuedMutation> {
  if (!mutation.entityType || !mutation.targetEntityId) return mutation

  const resolvedId = await getResolvedEntityId(mutation.entityType, mutation.targetEntityId)
  if (resolvedId === mutation.targetEntityId) return mutation

  return rewriteMutationIdReferences(mutation, mutation.targetEntityId, resolvedId)
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

function inferScope(type: MutationType): MutationScope {
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
    case 'deleteUserFact':
    case 'bulkDeleteUserFacts':
      return 'userFacts'
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
    case 'setAiMemory':
    case 'setAiSummary':
    case 'completeOnboarding':
    case 'resetProfile':
      return 'profile'
    default:
      return 'habits'
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
  const resolvedMutation = await resolveMutationReferences(mutation)
  const online = await getCurrentConnectivity()
  const hasPendingDependencies = hasPendingOfflineDependencies(resolvedMutation)

  if (!online || hasPendingDependencies) {
    await markQueuedMutation(resolvedMutation)
    return queuedResult
  }

  try {
    return await execute(resolvedMutation)
  } catch (error: unknown) {
    if (!isTransientNetworkError(error)) {
      throw error
    }

    await markQueuedMutation(resolvedMutation)
    return queuedResult
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
  mutation: QueuedMutation,
): void {
  touchedScopes.add(mutation.scope ?? inferScope(mutation.type))
}

async function clearCreatedOfflineEntity(
  mutation: QueuedMutation,
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

async function clearDeletedOfflineEntity(mutation: QueuedMutation): Promise<void> {
  if (!mutation.entityType || !mutation.targetEntityId || !mutation.type.startsWith('delete')) {
    return
  }

  await clearOfflineEntity(mutation.entityType, mutation.targetEntityId)
}

async function finalizeSuccessfulFlush(
  mutation: QueuedMutation,
  response: unknown,
  touchedScopes: Set<MutationScope>,
): Promise<void> {
  addTouchedScope(touchedScopes, mutation)
  await clearCreatedOfflineEntity(mutation, response)
  await clearDeletedOfflineEntity(mutation)
  remove(mutation.id)
}

async function markMutationSyncing(mutation: QueuedMutation): Promise<void> {
  update(mutation.id, { status: 'syncing', lastError: null })

  if (mutation.entityType && mutation.clientEntityId) {
    await setOfflineEntityStatus(mutation.entityType, mutation.clientEntityId, 'syncing')
  }
}

async function handleFlushFailure(
  mutation: QueuedMutation,
  error: unknown,
  touchedScopes: Set<MutationScope>,
): Promise<{
  incrementFailed: boolean
  stop: boolean
}> {
  if (isTransientNetworkError(error)) {
    update(mutation.id, { status: 'failed', lastError: getErrorMessage(error) })
    return { incrementFailed: false, stop: true }
  }

  const nextRetries = mutation.retries + 1
  const dropMutation = shouldDropMutation(error, nextRetries, mutation.maxRetries)

  if (dropMutation) {
    remove(mutation.id)
    addTouchedScope(touchedScopes, mutation)

    if (mutation.entityType && mutation.clientEntityId) {
      await clearOfflineEntity(mutation.entityType, mutation.clientEntityId)
    }
  } else {
    const lastError = getErrorMessage(error)

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
    incrementFailed: true,
    stop: shouldStopFlushing(error),
  }
}

async function invalidateTouchedScopes(scopes: Set<MutationScope>): Promise<void> {
  for (const scope of scopes) {
    for (const queryKey of SCOPE_QUERY_KEYS[scope]) {
      await queryClient.invalidateQueries({ queryKey })
    }
  }
}

type FlushStepResult = {
  failedDelta: number
  shouldBreak: boolean
  succeededDelta: number
}

async function processQueuedMutationFlush(
  originalMutation: QueuedMutation,
  touchedScopes: Set<MutationScope>,
): Promise<FlushStepResult> {
  const currentMutation = getById(originalMutation.id)
  if (!currentMutation) {
    return { failedDelta: 0, shouldBreak: false, succeededDelta: 0 }
  }

  const mutation = await resolveMutationReferences(currentMutation)
  if (hasPendingOfflineDependencies(mutation)) {
    update(mutation.id, { status: 'pending', lastError: null })
    return { failedDelta: 0, shouldBreak: false, succeededDelta: 0 }
  }

  await markMutationSyncing(mutation)

  try {
    const response = await apiClient<unknown>(mutation.endpoint, {
      method: mutation.method,
      body: serializeMutationPayload(mutation.payload),
    })

    await finalizeSuccessfulFlush(mutation, response, touchedScopes)
    return { failedDelta: 0, shouldBreak: false, succeededDelta: 1 }
  } catch (error: unknown) {
    const failure = await handleFlushFailure(mutation, error, touchedScopes)
    return {
      failedDelta: failure.incrementFailed ? 1 : 0,
      shouldBreak: failure.stop,
      succeededDelta: 0,
    }
  }
}

export async function flushQueuedMutations(): Promise<{
  succeeded: number
  failed: number
  remaining: number
}> {
  let succeeded = 0
  let failed = 0
  const touchedScopes = new Set<MutationScope>()
  const pending = getAll()

  for (const originalMutation of pending) {
    const step = await processQueuedMutationFlush(originalMutation, touchedScopes)
    succeeded += step.succeededDelta
    failed += step.failedDelta
    if (step.shouldBreak) break
  }

  await invalidateTouchedScopes(touchedScopes)
  await persistQueryCache()

  return {
    succeeded,
    failed,
    remaining: count(),
  }
}
