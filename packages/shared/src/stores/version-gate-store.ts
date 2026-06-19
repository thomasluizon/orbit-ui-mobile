type VersionGateStoreSet = {
  (
    partial:
      | Partial<VersionGateStoreState>
      | ((state: VersionGateStoreState) => Partial<VersionGateStoreState>),
    replace?: false,
  ): void
  (
    state:
      | VersionGateStoreState
      | ((state: VersionGateStoreState) => VersionGateStoreState),
    replace: true,
  ): void
}

/**
 * Ephemeral client signal for the minimum-supported-version gate. Set when an
 * API call returns HTTP 426 so the platform surface (mobile blocker / web
 * banner) can react. Never persisted — a relaunch should re-derive it from a
 * fresh request.
 */
export interface VersionGateStoreState {
  upgradeRequired: boolean
  minVersion: string | null
  markUpgradeRequired: (minVersion: string | null) => void
  clearUpgradeRequired: () => void
}

export function createVersionGateStoreState(
  set: VersionGateStoreSet,
): VersionGateStoreState {
  return {
    upgradeRequired: false,
    minVersion: null,
    markUpgradeRequired: (minVersion) =>
      set({ upgradeRequired: true, minVersion }),
    clearUpgradeRequired: () =>
      set({ upgradeRequired: false, minVersion: null }),
  }
}
