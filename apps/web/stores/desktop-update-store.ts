import { create } from 'zustand'

export interface DesktopUpdateNotice {
  kind: 'web' | 'shell'
  phase: 'available' | 'downloading' | 'installing' | 'failed'
}

interface DesktopUpdateStore {
  notice: DesktopUpdateNotice | null
  restart: (() => void) | null
  later: (() => void) | null
}

export const useDesktopUpdateStore = create<DesktopUpdateStore>(() => ({ notice: null, restart: null, later: null }))
