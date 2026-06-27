import type { BulkHabitItem } from '../types/habit'

export interface TemplatePackHabit {
  /** Stable identifier within the pack; also the i18n sub-key for the habit title. */
  key: string
  emoji: string
  frequencyUnit: 'Day' | 'Week'
  frequencyQuantity: number
  /** Tag slugs applied on creation, resolved to localized tag names via templatePackTagKey. */
  tags: readonly string[]
}

export interface TemplatePack {
  /** Stable identifier; also the i18n sub-key for the pack name and description. */
  id: string
  emoji: string
  habits: readonly TemplatePackHabit[]
}

const TEMPLATE_PACK_I18N_PREFIX = 'onboarding.flow.templatePacks'

export function templatePackNameKey(packId: string): string {
  return `${TEMPLATE_PACK_I18N_PREFIX}.packs.${packId}.name`
}

export function templatePackDescriptionKey(packId: string): string {
  return `${TEMPLATE_PACK_I18N_PREFIX}.packs.${packId}.description`
}

export function templatePackHabitTitleKey(packId: string, habitKey: string): string {
  return `${TEMPLATE_PACK_I18N_PREFIX}.packs.${packId}.habits.${habitKey}`
}

export function templatePackTagKey(tagSlug: string): string {
  return `${TEMPLATE_PACK_I18N_PREFIX}.tags.${tagSlug}`
}

export const TEMPLATE_PACKS: readonly TemplatePack[] = [
  {
    id: 'morningRoutine',
    emoji: '🌅',
    habits: [
      { key: 'makeBed', emoji: '🛏️', frequencyUnit: 'Day', frequencyQuantity: 1, tags: ['morning'] },
      { key: 'water', emoji: '💧', frequencyUnit: 'Day', frequencyQuantity: 1, tags: ['morning', 'health'] },
      { key: 'stretch', emoji: '🧘', frequencyUnit: 'Day', frequencyQuantity: 1, tags: ['morning', 'movement'] },
      { key: 'breakfast', emoji: '🍳', frequencyUnit: 'Day', frequencyQuantity: 1, tags: ['morning', 'health'] },
      { key: 'planDay', emoji: '✅', frequencyUnit: 'Day', frequencyQuantity: 1, tags: ['morning', 'focus'] },
    ],
  },
  {
    id: 'fitnessMovement',
    emoji: '🏃',
    habits: [
      { key: 'walk', emoji: '🚶', frequencyUnit: 'Day', frequencyQuantity: 1, tags: ['movement'] },
      { key: 'strength', emoji: '🏋️', frequencyUnit: 'Week', frequencyQuantity: 1, tags: ['movement', 'fitness'] },
      { key: 'mobility', emoji: '🤸', frequencyUnit: 'Day', frequencyQuantity: 1, tags: ['movement'] },
      { key: 'stairs', emoji: '🪜', frequencyUnit: 'Day', frequencyQuantity: 1, tags: ['movement'] },
      { key: 'steps', emoji: '👟', frequencyUnit: 'Day', frequencyQuantity: 1, tags: ['movement', 'health'] },
    ],
  },
  {
    id: 'studyFocus',
    emoji: '📚',
    habits: [
      { key: 'deepWork', emoji: '📚', frequencyUnit: 'Day', frequencyQuantity: 1, tags: ['focus'] },
      { key: 'read', emoji: '📖', frequencyUnit: 'Day', frequencyQuantity: 1, tags: ['focus', 'learning'] },
      { key: 'reviewNotes', emoji: '📝', frequencyUnit: 'Day', frequencyQuantity: 1, tags: ['focus', 'learning'] },
      { key: 'phoneFree', emoji: '📵', frequencyUnit: 'Day', frequencyQuantity: 1, tags: ['focus'] },
      { key: 'singleTask', emoji: '🎯', frequencyUnit: 'Day', frequencyQuantity: 1, tags: ['focus'] },
    ],
  },
  {
    id: 'mindfulnessWellbeing',
    emoji: '🧘',
    habits: [
      { key: 'meditate', emoji: '🧘', frequencyUnit: 'Day', frequencyQuantity: 1, tags: ['mindfulness'] },
      { key: 'gratitude', emoji: '🙏', frequencyUnit: 'Day', frequencyQuantity: 1, tags: ['mindfulness', 'journal'] },
      { key: 'digitalSunset', emoji: '🌙', frequencyUnit: 'Day', frequencyQuantity: 1, tags: ['mindfulness', 'sleep'] },
      { key: 'breathing', emoji: '🌬️', frequencyUnit: 'Day', frequencyQuantity: 1, tags: ['mindfulness'] },
      { key: 'reachOut', emoji: '💬', frequencyUnit: 'Day', frequencyQuantity: 1, tags: ['mindfulness', 'social'] },
    ],
  },
]

export function getTemplatePackById(packId: string): TemplatePack | undefined {
  return TEMPLATE_PACKS.find((pack) => pack.id === packId)
}

/**
 * Resolves a pack's enabled habits into bulk-create items. Disabled keys are dropped;
 * titles and tags are localized through the provided translate function.
 */
export function buildBulkItemsFromPack(
  pack: TemplatePack,
  disabledHabitKeys: ReadonlySet<string>,
  translate: (key: string) => string,
): BulkHabitItem[] {
  return pack.habits
    .filter((habit) => !disabledHabitKeys.has(habit.key))
    .map((habit) => ({
      title: translate(templatePackHabitTitleKey(pack.id, habit.key)),
      emoji: habit.emoji,
      frequencyUnit: habit.frequencyUnit,
      frequencyQuantity: habit.frequencyQuantity,
      isGeneral: false,
      tags: habit.tags.map((slug) => translate(templatePackTagKey(slug))),
    }))
}
