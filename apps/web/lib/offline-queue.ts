import { openDB, type IDBPDatabase } from 'idb'
import type { QueuedMutation } from '@orbit/shared/types/sync'

const DB_NAME = 'orbit-offline'
const STORE_NAME = 'mutations'
const DB_VERSION = 1

async function getDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    },
  })
}

export async function enqueueMutation(mutation: QueuedMutation): Promise<void> {
  const db = await getDB()
  await db.put(STORE_NAME, mutation)
}

export async function dequeueMutation(id: string): Promise<void> {
  const db = await getDB()
  await db.delete(STORE_NAME, id)
}

export async function getAllMutations(): Promise<QueuedMutation[]> {
  const db = await getDB()
  const all = await db.getAll(STORE_NAME)
  return (all as QueuedMutation[]).sort((a, b) => a.timestamp - b.timestamp)
}

export async function getQueueSize(): Promise<number> {
  const db = await getDB()
  return db.count(STORE_NAME)
}

export async function clearQueue(): Promise<void> {
  const db = await getDB()
  await db.clear(STORE_NAME)
}

export async function replayQueue(): Promise<{ succeeded: number; failed: number }> {
  const mutations = await getAllMutations()
  let succeeded = 0
  let failed = 0

  for (const mutation of mutations) {
    try {
      const res = await fetch(mutation.endpoint, {
        method: mutation.method,
        headers: { 'Content-Type': 'application/json' },
        body: mutation.payload ? JSON.stringify(mutation.payload) : undefined,
      })

      if (res.ok) {
        await dequeueMutation(mutation.id)
        succeeded++
      } else {
        const status = res.status
        // Entity deleted or conflict -- discard
        if (status === 404 || status === 409 || status === 410) {
          await dequeueMutation(mutation.id)
          failed++
        } else if (mutation.retries < mutation.maxRetries) {
          // Transient error -- increment retry
          mutation.retries++
          await enqueueMutation(mutation)
          failed++
        } else {
          // Max retries -- discard
          await dequeueMutation(mutation.id)
          failed++
        }
      }
    } catch {
      // Network error -- stop replay (still offline)
      break
    }
  }

  return { succeeded, failed }
}
