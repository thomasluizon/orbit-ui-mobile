type EngagementPromptStoreSet = {
  (
    partial:
      | Partial<EngagementPromptStoreState>
      | ((state: EngagementPromptStoreState) => Partial<EngagementPromptStoreState>),
    replace?: false,
  ): void
  (
    state:
      | EngagementPromptStoreState
      | ((state: EngagementPromptStoreState) => EngagementPromptStoreState),
    replace: true,
  ): void
}

/** The engagement-prompt families that share one cooldown budget and one armed slot. */
export type EngagementPromptKind = 'referral' | 'milestone-share'

/** Arbiter weights: a milestone-share prompt outranks a referral prompt for the single armed slot. */
export const ENGAGEMENT_PROMPT_PRIORITY: Record<EngagementPromptKind, number> = {
  'milestone-share': 2,
  referral: 1,
}

export const STREAK_CROSSING_MILESTONES = [7, 30, 100] as const

export const REFERRAL_PROMPT_COOLDOWN_DAYS = 14

const COOLDOWN_MS = REFERRAL_PROMPT_COOLDOWN_DAYS * 24 * 60 * 60 * 1000

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

/** Maps a freshly-reached streak length to its milestone-share key, or null when the length is not a shareable milestone (7/30/100). */
export function getMilestoneShareStreakKey(streak: number): string | null {
  return (STREAK_CROSSING_MILESTONES as readonly number[]).includes(streak)
    ? `share-streak-${streak}`
    : null
}

/** Builds the milestone-share key for a newly earned achievement, namespaced so it never collides with streak keys. */
export function getMilestoneShareAchievementKey(achievementId: string): string {
  return `share-achv-${achievementId}`
}

export type MilestoneShareKey =
  | { kind: 'streak'; value: number }
  | { kind: 'achievement'; achievementId: string }

/** Parses a milestone-share key (`share-streak-N` / `share-achv-ID`) back into its kind and payload, or null when malformed. */
export function parseMilestoneShareKey(milestoneKey: string): MilestoneShareKey | null {
  const streakPrefix = 'share-streak-'
  const achievementPrefix = 'share-achv-'

  if (milestoneKey.startsWith(streakPrefix)) {
    const raw = milestoneKey.slice(streakPrefix.length)
    const value = Number(raw)
    if (raw === '' || !Number.isFinite(value)) return null
    return { kind: 'streak', value }
  }

  if (milestoneKey.startsWith(achievementPrefix)) {
    const achievementId = milestoneKey.slice(achievementPrefix.length)
    if (!achievementId) return null
    return { kind: 'achievement', achievementId }
  }

  return null
}

/** Builds the referral-prompt milestone key for a newly reached level. */
export function getReferralLevelMilestone(level: number): string {
  return `level-${level}`
}

export interface ReferralMilestone {
  kind: 'streak' | 'level'
  value: number
}

/** Parses a referral milestone key (`streak-N` / `level-N`) back into its kind and numeric value, or null when malformed. */
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

export interface EngagementPromptGuardState {
  promptedMilestoneKeys: string[]
  lastPromptedAtIso: string | null
}

/** True when the milestone has never been prompted and the shared cooldown window since the last prompt (of any kind) has elapsed. */
export function canPromptEngagement(
  state: EngagementPromptGuardState,
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

export interface ArmedEngagementPrompt {
  kind: EngagementPromptKind
  milestoneKey: string
}

export interface PersistedEngagementPromptState {
  promptedMilestoneKeys: string[]
  lastPromptedAtIso: string | null
  homeEntryDismissed: boolean
}

export interface EngagementPromptStoreState extends PersistedEngagementPromptState {
  /** Transient prompt awaiting display; excluded from persistence so a reload simply skips a missed milestone. */
  armedPrompt: ArmedEngagementPrompt | null

  armEngagementPrompt: (kind: EngagementPromptKind, milestoneKey: string) => void
  armReferralPrompt: (milestoneKey: string) => void
  armMilestoneSharePrompt: (milestoneKey: string) => void
  clearArmedMilestone: () => void
  markEngagementPrompted: (milestoneKey: string, nowIso: string) => void
  dismissHomeEntry: () => void
}

export function getPersistedEngagementPromptState(
  state: EngagementPromptStoreState,
): PersistedEngagementPromptState {
  return {
    promptedMilestoneKeys: [...state.promptedMilestoneKeys],
    lastPromptedAtIso: state.lastPromptedAtIso,
    homeEntryDismissed: state.homeEntryDismissed,
  }
}

export function migratePersistedEngagementPromptState(
  persistedState: unknown,
): PersistedEngagementPromptState {
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

export function createEngagementPromptStoreState(
  set: EngagementPromptStoreSet,
): EngagementPromptStoreState {
  function armEngagementPrompt(
    kind: EngagementPromptKind,
    milestoneKey: string,
  ): void {
    set((state) => {
      const current = state.armedPrompt
      if (
        current === null
        || ENGAGEMENT_PROMPT_PRIORITY[kind] >= ENGAGEMENT_PROMPT_PRIORITY[current.kind]
      ) {
        return { armedPrompt: { kind, milestoneKey } }
      }
      return {}
    })
  }

  return {
    promptedMilestoneKeys: [],
    lastPromptedAtIso: null,
    homeEntryDismissed: false,
    armedPrompt: null,

    armEngagementPrompt,
    armReferralPrompt: (milestoneKey) =>
      armEngagementPrompt('referral', milestoneKey),
    armMilestoneSharePrompt: (milestoneKey) =>
      armEngagementPrompt('milestone-share', milestoneKey),

    clearArmedMilestone: () => set({ armedPrompt: null }),

    markEngagementPrompted: (milestoneKey, nowIso) =>
      set((state) => ({
        promptedMilestoneKeys: state.promptedMilestoneKeys.includes(milestoneKey)
          ? state.promptedMilestoneKeys
          : [...state.promptedMilestoneKeys, milestoneKey],
        lastPromptedAtIso: nowIso,
        armedPrompt: null,
      })),

    dismissHomeEntry: () => set({ homeEntryDismissed: true }),
  }
}

export const canPromptReferral = canPromptEngagement

export const REFERRAL_STREAK_MILESTONES = STREAK_CROSSING_MILESTONES

export type ReferralPromptGuardState = EngagementPromptGuardState

export type PersistedReferralPromptState = PersistedEngagementPromptState

export type ReferralPromptStoreState = EngagementPromptStoreState
