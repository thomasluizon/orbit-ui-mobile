import type { StateStorage } from 'zustand/middleware'

const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
}

/**
 * Storage factory for zustand `persist`: returns `localStorage` in the browser
 * and a no-op store when storage is absent or access is denied.
 */
export function getPersistStorage(): StateStorage {
  try {
    return typeof localStorage === 'undefined' ? noopStorage : localStorage
  } catch {
    return noopStorage
  }
}
