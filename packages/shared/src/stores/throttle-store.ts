import { getErrorSurface } from '../utils/error-surface'

export interface ThrottleStoreState {
  error: unknown
  show: (error: unknown) => boolean
  clear: () => void
}

export function createThrottleStoreState(set: (state: Partial<ThrottleStoreState>) => void): ThrottleStoreState {
  return {
    error: null,
    show: (error) => {
      if (getErrorSurface(error).retryAt === null) return false
      set({ error })
      return true
    },
    clear: () => set({ error: null }),
  }
}
