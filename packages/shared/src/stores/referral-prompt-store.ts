type ReferralPromptStoreSet = {
  (
    partial:
      | Partial<ReferralPromptStoreState>
      | ((state: ReferralPromptStoreState) => Partial<ReferralPromptStoreState>),
    replace?: false,
  ): void
  (
    state:
      | ReferralPromptStoreState
      | ((state: ReferralPromptStoreState) => ReferralPromptStoreState),
    replace: true,
  ): void
}

export const REFERRAL_STREAK_MILESTONES = [7, 30, 100] as const

export const REFERRAL_PROMPT_COOLDOWN_DAYS = 14

const COOLDOWN_MS = REFERRAL_PROMPT_COOLDOWN_DAYS * 24 * 60 * 60 * 1000

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

/** Maps a freshly-crossed streak length to its referral-prompt milestone key, or null when the length is not a referral milestone (7/30/100). */
export function getReferralStreakMilestone(streak: number): string | null {
  return (REFERRAL_STREAK_MILESTONES as readonly number[]).includes(streak)
    ? `streak-${streak}`
    : null
}

/** Builds the referral-prompt milestone key for a newly reached level. */
export function getReferralLevelMilestone(level: number): string {
  return `level-${level}`
}

export interface ReferralMilestone {
  kind: 'streak' | 'level'
  value: number
}

/** Parses a milestone key (`streak-N` / `level-N`) back into its kind and numeric value, or null when malformed. */
export function parseReferralMilestoneKey(
  milestoneKey: string,
): ReferralMilestone | null {
  const separatorIndex = milestoneKey.indexOf('-')
  if (separatorIndex < 0) return null

  const kind = milestoneKey.slice(0, separatorIndex)
  const value = Number(milestoneKey.slice(separatorIndex + 1))
  if (!Number.isFinite(value)) return null
  if (kind === 'streak') return { kind: 'streak', value }
  if (kind === 'level') return { kind: 'level', value }
  return null
}

export interface ReferralPromptGuardState {
  promptedMilestoneKeys: string[]
  lastPromptedAtIso: string | null
}

/** True when the milestone has never been prompted and the cooldown window since the last prompt has elapsed. */
export function canPromptReferral(
  state: ReferralPromptGuardState,
  milestoneKey: string,
  nowIso: string,
): boolean {
  if (state.promptedMilestoneKeys.includes(milestoneKey)) return false
  if (!state.lastPromptedAtIso) return true

  const last = new Date(state.lastPromptedAtIso).getTime()
  const now = new Date(nowIso).getTime()
  if (Number.isNaN(last) || Number.isNaN(now)) return true

  return now - last >= COOLDOWN_MS
}

export interface PersistedReferralPromptState {
  promptedMilestoneKeys: string[]
  lastPromptedAtIso: string | null
  homeEntryDismissed: boolean
}

export interface ReferralPromptStoreState extends PersistedReferralPromptState {
  /** Transient milestone key awaiting a prompt; excluded from persistence so a reload simply skips a missed milestone. */
  armedMilestoneKey: string | null

  armReferralPrompt: (milestoneKey: string) => void
  clearArmedMilestone: () => void
  markReferralPrompted: (milestoneKey: string, nowIso: string) => void
  dismissHomeEntry: () => void
}

export function getPersistedReferralPromptState(
  state: ReferralPromptStoreState,
): PersistedReferralPromptState {
  return {
    promptedMilestoneKeys: [...state.promptedMilestoneKeys],
    lastPromptedAtIso: state.lastPromptedAtIso,
    homeEntryDismissed: state.homeEntryDismissed,
  }
}

export function migratePersistedReferralPromptState(
  persistedState: unknown,
): PersistedReferralPromptState {
  const state = isRecord(persistedState) ? persistedState : {}

  return {
    promptedMilestoneKeys: Array.isArray(state.promptedMilestoneKeys)
      ? state.promptedMilestoneKeys.filter(
          (key): key is string => typeof key === 'string',
        )
      : [],
    lastPromptedAtIso:
      typeof state.lastPromptedAtIso === 'string'
        ? state.lastPromptedAtIso
        : null,
    homeEntryDismissed:
      typeof state.homeEntryDismissed === 'boolean'
        ? state.homeEntryDismissed
        : false,
  }
}

export function createReferralPromptStoreState(
  set: ReferralPromptStoreSet,
): ReferralPromptStoreState {
  return {
    promptedMilestoneKeys: [],
    lastPromptedAtIso: null,
    homeEntryDismissed: false,
    armedMilestoneKey: null,

    armReferralPrompt: (milestoneKey) =>
      set({ armedMilestoneKey: milestoneKey }),

    clearArmedMilestone: () => set({ armedMilestoneKey: null }),

    markReferralPrompted: (milestoneKey, nowIso) =>
      set((state) => ({
        promptedMilestoneKeys: state.promptedMilestoneKeys.includes(milestoneKey)
          ? state.promptedMilestoneKeys
          : [...state.promptedMilestoneKeys, milestoneKey],
        lastPromptedAtIso: nowIso,
        armedMilestoneKey: null,
      })),

    dismissHomeEntry: () => set({ homeEntryDismissed: true }),
  }
}
