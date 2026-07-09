import type { StateStorage } from 'zustand/middleware'

const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
}

/**
 * Storage factory for zustand `persist`: returns `localStorage` in the browser
 * and a no-op store during server render, where `localStorage` is undefined.
 */
export function getPersistStorage(): StateStorage {
  return typeof localStorage === 'undefined' ? noopStorage : localStorage
}
