import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

const PERSISTENT_REMINDER_STORAGE_KEY = 'orbit-persistent-reminder'

interface PersistentReminderState {
  enabled: boolean
  setEnabled: (enabled: boolean) => void
}

/**
 * Local opt-in flag for the ongoing Android reminder notification. Defaults to
 * off and persists per-device through AsyncStorage; there is no backend mirror.
 */
export const usePersistentReminderStore = create<PersistentReminderState>()(
  persist(
    (set) => ({
      enabled: false,
      setEnabled: (enabled) => set({ enabled }),
    }),
    {
      name: PERSISTENT_REMINDER_STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ enabled: state.enabled }),
    },
  ),
)
