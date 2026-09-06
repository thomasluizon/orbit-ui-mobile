import * as SQLite from 'expo-sqlite'
import { useAuthStore } from '@/stores/auth-store'
import {
  mutationEntityTypeSchema,
  mutationScopeSchema,
  type MutationEntityType,
  type MutationScope,
  type PersistedQueuedMutation,
  type QueuedMutation,
  type QueuedMutationStatus,
} from '@orbit/shared/types/sync'

let db: SQLite.SQLiteDatabase | null = null

interface QueueMetaRow {
  scope?: MutationScope
  entityType?: MutationEntityType
  status?: QueuedMutationStatus
  dedupeKey?: string | null
  targetEntityId?: string | null
  clientEntityId?: string | null
  dependsOn?: string[]
  lastError?: string | null
}

interface QueueRow {
  id: string
  timestamp: number
  type: string
  endpoint: string
  method: string
  payload: string
  retries: number
  max_retries: number
  meta: string | null
}

type QueueListener = (count: number) => void

const queueListeners = new Set<QueueListener>()

function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync('orbit_offline.db')
    db.execSync(`
      CREATE TABLE IF NOT EXISTS mutation_queue (
        id TEXT PRIMARY KEY NOT NULL,
        timestamp INTEGER NOT NULL,
        type TEXT NOT NULL,
        endpoint TEXT NOT NULL,
        method TEXT NOT NULL,
        payload TEXT,
        retries INTEGER NOT NULL DEFAULT 0,
        max_retries INTEGER NOT NULL DEFAULT 3,
        meta TEXT,
        account_id TEXT
      );
    `)

    const columns = db.getAllSync<{ name: string }>('PRAGMA table_info(mutation_queue)')
    if (!columns.some((column) => column.name === 'meta')) {
      db.execSync('ALTER TABLE mutation_queue ADD COLUMN meta TEXT;')
    }
    if (!columns.some((column) => column.name === 'account_id')) {
      db.execSync('ALTER TABLE mutation_queue ADD COLUMN account_id TEXT;')
    }
  }
  return db
}

function emitQueueCount(): void {
  const current = count()
  for (const listener of queueListeners) {
    listener(current)
  }
}

export function subscribeQueueCount(listener: QueueListener): () => void {
  queueListeners.add(listener)
  const unsubscribeAuth = useAuthStore.subscribe((state, previous) => {
    if (state.isAuthenticated !== previous.isAuthenticated || state.user?.userId !== previous.user?.userId) listener(count())
  })
  listener(count())
  return () => {
    unsubscribeAuth()
    queueListeners.delete(listener)
  }
}

function parseJson<T>(value: string | null): T | null {
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function buildMeta(mutation: PersistedQueuedMutation): QueueMetaRow {
  return {
    scope: mutation.scope,
    entityType: mutation.entityType,
    status: mutation.status ?? 'pending',
    dedupeKey: mutation.dedupeKey ?? null,
    targetEntityId: mutation.targetEntityId ?? null,
    clientEntityId: mutation.clientEntityId ?? null,
    dependsOn: mutation.dependsOn ?? [],
    lastError: mutation.lastError ?? null,
  }
}

function mapRow(row: QueueRow): PersistedQueuedMutation {
  const meta = parseJson<QueueMetaRow>(row.meta) ?? {}
  const scope = mutationScopeSchema.safeParse(meta.scope)
  const entityType = mutationEntityTypeSchema.safeParse(meta.entityType)

  return {
    id: row.id,
    timestamp: row.timestamp,
    type: row.type,
    endpoint: row.endpoint,
    method: row.method as 'POST' | 'PUT' | 'DELETE',
    payload: parseJson(row.payload),
    retries: row.retries,
    maxRetries: row.max_retries,
    scope: scope.success ? scope.data : undefined,
    entityType: entityType.success ? entityType.data : undefined,
    status: meta.status ?? 'pending',
    dedupeKey: meta.dedupeKey ?? null,
    targetEntityId: meta.targetEntityId ?? null,
    clientEntityId: meta.clientEntityId ?? null,
    dependsOn: meta.dependsOn ?? [],
    lastError: meta.lastError ?? null,
  }
}

function currentAccountId(): string | null {
  const { isAuthenticated, user } = useAuthStore.getState()
  return isAuthenticated ? user?.userId ?? null : null
}

function upsert(database: SQLite.SQLiteDatabase, mutation: PersistedQueuedMutation, accountId: string | null): void {
  database.runSync(
    `INSERT OR REPLACE INTO mutation_queue (id, timestamp, type, endpoint, method, payload, retries, max_retries, meta, account_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      mutation.id,
      mutation.timestamp,
      mutation.type,
      mutation.endpoint,
      mutation.method,
      JSON.stringify(mutation.payload ?? null),
      mutation.retries,
      mutation.maxRetries,
      JSON.stringify(buildMeta(mutation)),
      accountId,
    ],
  )
}

function replaceAll(mutations: PersistedQueuedMutation[]): void {
  const database = getDb()
  const accountId = currentAccountId()
  database.withTransactionSync(() => {
    database.runSync('DELETE FROM mutation_queue WHERE account_id IS ? OR account_id IS NULL', [accountId])
    for (const mutation of mutations) {
      upsert(database, mutation, accountId)
    }
  })
  emitQueueCount()
}

function isCreateType(type: string): boolean {
  return type === 'createHabit' || type === 'createGoal' || type === 'createTag'
}

const MERGE_INTO_CREATE_TYPES = new Set<string>([
  'updateHabit',
  'updateChecklist',
  'assignTags',
  'updateGoal',
  'updateTag',
])

const DROP_CREATE_TYPES = new Set<string>([
  'deleteHabit',
  'bulkCascadeDeleteHabits',
  'deleteGoal',
  'deleteTag',
])

const LAST_WRITE_WINS_TYPES = new Set<string>([
  'setLanguage',
  'setWeekStartDay',
  'setColorScheme',
  'setThemePreference',
  'setTimeZone',
  'setAiSummary',
  'setProactiveAstra',
  'completeOnboarding',
  'dismissCalendarPrompt',
  'reorderHabits',
  'reorderGoals',
  'markAllNotificationsRead',
  'deleteAllNotifications',
])

const FIRST_WRITE_WINS_TYPES = new Set<string>(['logHabit'])

export function findUnfinalizedFirstWrite(
  mutation: Pick<QueuedMutation, 'type' | 'dedupeKey'>,
): PersistedQueuedMutation | null {
  return findFirstWrite(getAll(), mutation)
}

function findFirstWrite(
  queued: PersistedQueuedMutation[],
  mutation: Pick<QueuedMutation, 'type' | 'dedupeKey'>,
): PersistedQueuedMutation | null {
  if (!mutation.dedupeKey || !FIRST_WRITE_WINS_TYPES.has(mutation.type)) return null

  return queued.find(
    (queuedMutation) =>
      queuedMutation.type === mutation.type &&
      queuedMutation.dedupeKey === mutation.dedupeKey,
  ) ?? null
}

export function waitForFirstWriteFinalization(
  mutation: Pick<QueuedMutation, 'type' | 'dedupeKey'>,
): Promise<void> {
  if (!findUnfinalizedFirstWrite(mutation)) return Promise.resolve()

  return new Promise((resolve) => {
    const unsubscribe = subscribeQueueCount(() => {
      if (findUnfinalizedFirstWrite(mutation)) return
      unsubscribe()
      resolve()
    })
  })
}

function mergePayload(existing: unknown, incoming: unknown): unknown {
  if (
    existing &&
    incoming &&
    typeof existing === 'object' &&
    typeof incoming === 'object' &&
    !Array.isArray(existing) &&
    !Array.isArray(incoming)
  ) {
    return {
      ...(existing as Record<string, unknown>),
      ...(incoming as Record<string, unknown>),
    }
  }

  return incoming
}

function compactQueuedMutations(
  existing: PersistedQueuedMutation[],
  incoming: QueuedMutation,
): PersistedQueuedMutation[] {
  let next = [...existing]

  if (incoming.dedupeKey && LAST_WRITE_WINS_TYPES.has(incoming.type)) {
    next = next.filter((mutation) => mutation.dedupeKey !== incoming.dedupeKey)
  }

  const entityKey = incoming.clientEntityId ?? incoming.targetEntityId
  if (entityKey) {
    const createIndex = next.findIndex(
      (mutation) =>
        isCreateType(mutation.type) &&
        (mutation.clientEntityId ?? mutation.targetEntityId) === entityKey,
    )
    const createMutation = createIndex >= 0 ? next[createIndex] : undefined

    if (createMutation && MERGE_INTO_CREATE_TYPES.has(incoming.type)) {
      next[createIndex] = {
        ...createMutation,
        payload: mergePayload(createMutation.payload, incoming.payload),
      }
      return next
    }

    if (createMutation && DROP_CREATE_TYPES.has(incoming.type)) {
      next.splice(createIndex, 1)
      return next
    }
  }

  next.push(incoming)
  return next
}

function replaceValue(value: unknown, oldId: string, newId: string): unknown {
  if (value === oldId) return newId

  if (Array.isArray(value)) {
    return value.map((entry) => replaceValue(entry, oldId, newId))
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        replaceValue(entry, oldId, newId),
      ]),
    )
  }

  if (typeof value === 'string' && value.includes(oldId)) {
    return value.split(oldId).join(newId)
  }

  return value
}

export function enqueue(
  mutation: Omit<QueuedMutation, 'retries' | 'maxRetries'> & {
    retries?: number
    maxRetries?: number
  },
): string {
  const normalized: QueuedMutation = {
    ...mutation,
    retries: mutation.retries ?? 0,
    maxRetries: mutation.maxRetries ?? 3,
    status: mutation.status ?? 'pending',
    dependsOn: mutation.dependsOn ?? [],
  }

  const existing = getForAccount(currentAccountId())
  const existingMutation = findFirstWrite(existing, normalized)

  if (existingMutation) return existingMutation.id

  const compacted = compactQueuedMutations(existing, normalized)
  replaceAll(compacted)
  return normalized.id
}

export function dequeue(): PersistedQueuedMutation | null {
  return getAll()[0] ?? null
}

export function getAll(): PersistedQueuedMutation[] {
  const accountId = currentAccountId()
  return accountId === null ? [] : getForAccount(accountId)
}

function getForAccount(accountId: string | null): PersistedQueuedMutation[] {
  const database = getDb()
  const rows = database.getAllSync<QueueRow>('SELECT * FROM mutation_queue WHERE account_id IS ? OR account_id IS NULL ORDER BY timestamp ASC', [accountId])
  return rows.map(mapRow)
}

export function getById(id: string): PersistedQueuedMutation | null {
  return getAll().find((mutation) => mutation.id === id) ?? null
}

export function update(id: string, patch: Partial<PersistedQueuedMutation>): void {
  if (!getById(id)) return
  const updated = getAll().map((mutation) =>
    mutation.id === id
      ? {
          ...mutation,
          ...patch,
          dependsOn: patch.dependsOn ?? mutation.dependsOn,
        }
      : mutation,
  )
  replaceAll(updated)
}

export function remove(id: string): void {
  if (!getById(id)) return
  const database = getDb()
  database.runSync('DELETE FROM mutation_queue WHERE id = ?', [id])
  emitQueueCount()
}

export function replaceEntityReferences(oldId: string, newId: string): void {
  if (currentAccountId() === null) return
  const updated = getAll().map((mutation) => ({
    ...mutation,
    endpoint: mutation.endpoint.includes(oldId)
      ? mutation.endpoint.split(oldId).join(newId)
      : mutation.endpoint,
    payload: replaceValue(mutation.payload, oldId, newId),
    targetEntityId: mutation.targetEntityId === oldId ? newId : mutation.targetEntityId,
    clientEntityId: mutation.clientEntityId === oldId ? newId : mutation.clientEntityId,
    dependsOn: mutation.dependsOn?.map((id) => (id === oldId ? newId : id)) ?? [],
  }))

  replaceAll(updated)
}

export function incrementRetries(id: string): void {
  const current = getById(id)
  if (!current) return
  update(id, { retries: current.retries + 1 })
}

export function clear(): void {
  const database = getDb()
  database.runSync('DELETE FROM mutation_queue')
  emitQueueCount()
}

export function count(): number {
  const accountId = currentAccountId()
  if (accountId === null) return 0
  const database = getDb()
  const row = database.getFirstSync<{ cnt: number }>('SELECT COUNT(*) as cnt FROM mutation_queue WHERE account_id = ? OR account_id IS NULL', [accountId])
  return row?.cnt ?? 0
}

export function retainAccount(accountId: string): void {
  const database = getDb()
  database.withTransactionSync(() => {
    database.runSync('DELETE FROM mutation_queue WHERE account_id IS NOT NULL AND account_id != ?', [accountId])
    database.runSync('UPDATE mutation_queue SET account_id = ? WHERE account_id IS NULL', [accountId])
  })
  emitQueueCount()
}
