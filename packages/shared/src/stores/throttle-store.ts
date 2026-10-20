import { getErrorSurface } from '../utils/error-surface'

export interface ThrottleStoreState {
  error: unknown
  show: (status: number, payload: unknown) => boolean
  clear: () => void
}

export function createThrottleStoreState(set: (state: Partial<ThrottleStoreState>) => void): ThrottleStoreState {
  return {
    error: null,
    show: (status, payload) => {
      const error = { status, data: payload }
      if (getErrorSurface(error).retryAt === null) return false
      set({ error })
      return true
    },
    clear: () => set({ error: null }),
  }
}
