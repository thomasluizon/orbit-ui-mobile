export const FRESH_START_DELETED_ITEM_KEYS = [
  'profile.freshStart.deleteHabits',
  'profile.freshStart.deleteGoals',
  'profile.freshStart.deleteChat',
  'profile.freshStart.deleteUserFacts',
  'profile.freshStart.deleteAchievements',
  'profile.freshStart.deleteNotifications',
  'profile.freshStart.deleteChecklist',
  'profile.freshStart.deleteOnboarding',
] as const

export const FRESH_START_PRESERVED_ITEM_KEYS = [
  'profile.freshStart.preserveAccount',
  'profile.freshStart.preserveSubscription',
  'profile.freshStart.preservePreferences',
] as const

export type FreshStartTranslationAdapter = (key: string) => string

export function buildFreshStartDeletedItems(
  translate: FreshStartTranslationAdapter,
): string[] {
  return FRESH_START_DELETED_ITEM_KEYS.map((key) => translate(key))
}

export function buildFreshStartPreservedItems(
  translate: FreshStartTranslationAdapter,
): string[] {
  return FRESH_START_PRESERVED_ITEM_KEYS.map((key) => translate(key))
}
