import * as SQLite from 'expo-sqlite'
import type { QueuedMutation, MutationType } from '@orbit/shared/types/sync'

let db: SQLite.SQLiteDatabase | null = null

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
        max_retries INTEGER NOT NULL DEFAULT 3
      );
    `)
  }
  return db
}

export function enqueue(mutation: Omit<QueuedMutation, 'retries' | 'maxRetries'> & { retries?: number; maxRetries?: number }): void {
  const database = getDb()
  database.runSync(
    `INSERT OR REPLACE INTO mutation_queue (id, timestamp, type, endpoint, method, payload, retries, max_retries)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      mutation.id,
      mutation.timestamp,
      mutation.type,
      mutation.endpoint,
      mutation.method,
      JSON.stringify(mutation.payload),
      mutation.retries ?? 0,
      mutation.maxRetries ?? 3,
    ],
  )
}

export function dequeue(): QueuedMutation | null {
  const database = getDb()
  const row = database.getFirstSync<{
    id: string
    timestamp: number
    type: string
    endpoint: string
    method: string
    payload: string
    retries: number
    max_retries: number
  }>('SELECT * FROM mutation_queue ORDER BY timestamp ASC LIMIT 1')

  if (!row) return null

  return {
    id: row.id,
    timestamp: row.timestamp,
    type: row.type as MutationType,
    endpoint: row.endpoint,
    method: row.method as 'POST' | 'PUT' | 'DELETE',
    payload: JSON.parse(row.payload),
    retries: row.retries,
    maxRetries: row.max_retries,
  }
}

export function getAll(): QueuedMutation[] {
  const database = getDb()
  const rows = database.getAllSync<{
    id: string
    timestamp: number
    type: string
    endpoint: string
    method: string
    payload: string
    retries: number
    max_retries: number
  }>('SELECT * FROM mutation_queue ORDER BY timestamp ASC')

  return rows.map((row) => ({
    id: row.id,
    timestamp: row.timestamp,
    type: row.type as MutationType,
    endpoint: row.endpoint,
    method: row.method as 'POST' | 'PUT' | 'DELETE',
    payload: JSON.parse(row.payload),
    retries: row.retries,
    maxRetries: row.max_retries,
  }))
}

export function remove(id: string): void {
  const database = getDb()
  database.runSync('DELETE FROM mutation_queue WHERE id = ?', [id])
}

export function incrementRetries(id: string): void {
  const database = getDb()
  database.runSync('UPDATE mutation_queue SET retries = retries + 1 WHERE id = ?', [id])
}

export function clear(): void {
  const database = getDb()
  database.runSync('DELETE FROM mutation_queue')
}

export function count(): number {
  const database = getDb()
  const row = database.getFirstSync<{ cnt: number }>('SELECT COUNT(*) as cnt FROM mutation_queue')
  return row?.cnt ?? 0
}
