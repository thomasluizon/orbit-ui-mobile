export const FRESH_START_DELETED_ITEM_KEYS = [
  'profile.freshStart.deleteHabits',
  'profile.freshStart.deleteGoals',
  'profile.freshStart.deleteChat',
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

type FreshStartTranslationAdapter = (key: string) => string

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

/** The typed confirmation of a fresh start: the word ORBIT, with no regard to case or the outer spaces. */
export function isFreshStartConfirmed(confirmText: string): boolean {
  return confirmText.trim().toUpperCase() === 'ORBIT'
}

/**
 * The answer to a press of the delete action: nothing while the reset cannot run, the focus back on the field while
 * the confirmation is wrong, else the reset. Each platform states when the reset cannot run.
 */
export function freshStartSubmitAction({ confirmText, blocked }: { confirmText: string; blocked: boolean }): 'none' | 'refocus' | 'reset' {
  if (blocked) return 'none'
  return isFreshStartConfirmed(confirmText) ? 'reset' : 'refocus'
}
