import AsyncStorage from '@react-native-async-storage/async-storage'
import type { MutationEntityType } from '@orbit/shared/types/sync'

const STORAGE_KEY = '@orbit/offline-state'

export type OfflineEntityStatus = 'pending' | 'syncing' | 'failed' | 'synced'

export interface OfflineEntityRecord {
  entityType: MutationEntityType
  tempId: string
  serverId: string | null
  status: OfflineEntityStatus
  tombstone: boolean
  updatedAt: number
  lastError: string | null
}

interface OfflineState {
  entities: Record<string, OfflineEntityRecord>
}

let stateCache: OfflineState | null = null

function buildEntityKey(entityType: MutationEntityType, id: string): string {
  return `${entityType}:${id}`
}

async function readState(): Promise<OfflineState> {
  if (stateCache) return stateCache

  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (raw) {
      stateCache = JSON.parse(raw) as OfflineState
      return stateCache
    }
  } catch {
    // Ignore storage failures and fall back to an in-memory empty state.
  }

  stateCache = { entities: {} }
  return stateCache
}

async function writeState(state: OfflineState): Promise<void> {
  stateCache = state

  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Best-effort persistence only.
  }
}

export async function upsertOfflineEntity(record: OfflineEntityRecord): Promise<void> {
  const state = await readState()
  state.entities[buildEntityKey(record.entityType, record.tempId)] = record
  await writeState(state)
}

export async function setOfflineEntityStatus(
  entityType: MutationEntityType,
  id: string,
  status: OfflineEntityStatus,
  lastError: string | null = null,
): Promise<void> {
  const state = await readState()
  const key = buildEntityKey(entityType, id)
  const existing = state.entities[key]
  if (!existing) return

  state.entities[key] = {
    ...existing,
    status,
    lastError,
    updatedAt: Date.now(),
  }
  await writeState(state)
}

export async function markOfflineTombstone(
  entityType: MutationEntityType,
  id: string,
  tombstone = true,
): Promise<void> {
  const state = await readState()
  const key = buildEntityKey(entityType, id)
  const existing = state.entities[key]

  state.entities[key] = {
    entityType,
    tempId: existing?.tempId ?? id,
    serverId: existing?.serverId ?? (id.startsWith('offline-') ? null : id),
    status: existing?.status ?? 'pending',
    tombstone,
    updatedAt: Date.now(),
    lastError: existing?.lastError ?? null,
  }

  await writeState(state)
}

export async function resolveOfflineEntity(
  entityType: MutationEntityType,
  tempId: string,
  serverId: string,
): Promise<void> {
  const state = await readState()
  const key = buildEntityKey(entityType, tempId)
  const existing = state.entities[key]

  state.entities[key] = {
    entityType,
    tempId,
    serverId,
    status: 'synced',
    tombstone: existing?.tombstone ?? false,
    updatedAt: Date.now(),
    lastError: null,
  }

  await writeState(state)
}

export async function getResolvedEntityId(
  entityType: MutationEntityType,
  id: string,
): Promise<string> {
  const state = await readState()
  return state.entities[buildEntityKey(entityType, id)]?.serverId ?? id
}

export async function clearOfflineEntity(
  entityType: MutationEntityType,
  id: string,
): Promise<void> {
  const state = await readState()
  delete state.entities[buildEntityKey(entityType, id)]
  await writeState(state)
}
