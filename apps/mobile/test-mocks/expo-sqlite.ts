/**
 * `expo-sqlite` reaches a whole native database engine, so it is the one Expo dependency the
 * test runtime does not reproduce. A suite that does exercise the queue keeps its own richer
 * `vi.mock`.
 */
export interface MockSQLiteRunResult {
  lastInsertRowId: number
  changes: number
}

export interface MockSQLiteDatabase {
  execSync: (source: string) => void
  runSync: (source: string, ...params: unknown[]) => MockSQLiteRunResult
  getAllSync: <T>(source: string, ...params: unknown[]) => T[]
  getFirstSync: <T>(source: string, ...params: unknown[]) => T | null
  withTransactionSync: (task: () => void) => void
  closeSync: () => void
}

export function openDatabaseSync(): MockSQLiteDatabase {
  return {
    execSync: () => {},
    runSync: () => ({ lastInsertRowId: 0, changes: 0 }),
    getAllSync: <T,>() => [] as T[],
    getFirstSync: <T,>() => null as T | null,
    withTransactionSync: (task: () => void) => {
      task()
    },
    closeSync: () => {},
  }
}
