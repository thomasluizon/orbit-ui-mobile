import * as SQLite from 'expo-sqlite'
import type {
  MutationEntityType,
  MutationScope,
  MutationType,
  QueuedMutation,
  QueuedMutationStatus,
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
        meta TEXT
      );
    `)

    const columns = db.getAllSync<{ name: string }>('PRAGMA table_info(mutation_queue)')
    if (!columns.some((column) => column.name === 'meta')) {
      db.execSync('ALTER TABLE mutation_queue ADD COLUMN meta TEXT;')
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
  listener(count())
  return () => {
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

function buildMeta(mutation: QueuedMutation): QueueMetaRow {
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

function mapRow(row: QueueRow): QueuedMutation {
  const meta = parseJson<QueueMetaRow>(row.meta) ?? {}

  return {
    id: row.id,
    timestamp: row.timestamp,
    type: row.type as MutationType,
    endpoint: row.endpoint,
    method: row.method as 'POST' | 'PUT' | 'DELETE',
    payload: parseJson(row.payload),
    retries: row.retries,
    maxRetries: row.max_retries,
    scope: meta.scope,
    entityType: meta.entityType,
    status: meta.status ?? 'pending',
    dedupeKey: meta.dedupeKey ?? null,
    targetEntityId: meta.targetEntityId ?? null,
    clientEntityId: meta.clientEntityId ?? null,
    dependsOn: meta.dependsOn ?? [],
    lastError: meta.lastError ?? null,
  }
}

function upsert(database: SQLite.SQLiteDatabase, mutation: QueuedMutation): void {
  database.runSync(
    `INSERT OR REPLACE INTO mutation_queue (id, timestamp, type, endpoint, method, payload, retries, max_retries, meta)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    ],
  )
}

function replaceAll(mutations: QueuedMutation[]): void {
  const database = getDb()
  database.runSync('DELETE FROM mutation_queue')
  for (const mutation of mutations) {
    upsert(database, mutation)
  }
  emitQueueCount()
}

function isCreateType(type: MutationType): boolean {
  return type === 'createHabit' || type === 'createGoal' || type === 'createTag'
}

const MERGE_INTO_CREATE_TYPES = new Set<MutationType>([
  'updateHabit',
  'updateChecklist',
  'assignTags',
  'updateGoal',
  'updateTag',
])

const DROP_CREATE_TYPES = new Set<MutationType>(['deleteHabit', 'deleteGoal', 'deleteTag'])

const LAST_WRITE_WINS_TYPES = new Set<MutationType>([
  'setLanguage',
  'setWeekStartDay',
  'setColorScheme',
  'setTimeZone',
  'setAiMemory',
  'setAiSummary',
  'completeOnboarding',
  'dismissCalendarPrompt',
  'reorderHabits',
  'reorderGoals',
  'markAllNotificationsRead',
  'deleteAllNotifications',
  'bulkDeleteUserFacts',
])

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
  existing: QueuedMutation[],
  incoming: QueuedMutation,
): QueuedMutation[] {
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
): void {
  const normalized: QueuedMutation = {
    ...mutation,
    retries: mutation.retries ?? 0,
    maxRetries: mutation.maxRetries ?? 3,
    status: mutation.status ?? 'pending',
    dependsOn: mutation.dependsOn ?? [],
  }

  const compacted = compactQueuedMutations(getAll(), normalized)
  replaceAll(compacted)
}

export function dequeue(): QueuedMutation | null {
  return getAll()[0] ?? null
}

export function getAll(): QueuedMutation[] {
  const database = getDb()
  const rows = database.getAllSync<QueueRow>('SELECT * FROM mutation_queue ORDER BY timestamp ASC')
  return rows.map(mapRow)
}

export function getById(id: string): QueuedMutation | null {
  return getAll().find((mutation) => mutation.id === id) ?? null
}

export function update(id: string, patch: Partial<QueuedMutation>): void {
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
  const database = getDb()
  database.runSync('DELETE FROM mutation_queue WHERE id = ?', [id])
  emitQueueCount()
}

export function replaceEntityReferences(oldId: string, newId: string): void {
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
  const database = getDb()
  const row = database.getFirstSync<{ cnt: number }>('SELECT COUNT(*) as cnt FROM mutation_queue')
  return row?.cnt ?? 0
}
