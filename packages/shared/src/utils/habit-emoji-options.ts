export const DEFAULT_HABIT_EMOJI = '✨'

export interface HabitEmojiCategory {
  readonly id: string
  readonly labelKey: string
  readonly searchTerms: string
  readonly emojis: readonly string[]
}

export const HABIT_EMOJI_CATEGORIES: readonly HabitEmojiCategory[] = [
  {
    id: 'smileys',
    labelKey: 'habits.form.emojiCategorySmileys',
    searchTerms: 'smileys emotions mood happy sad calm sleep focus celebrate face feeling',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃',
      '😉', '😍', '🥰', '😘', '😋', '😛', '😜', '🤪', '🤗', '🤔', '🫡', '🤩',
      '🥳', '😎', '😴', '😌', '😮‍💨', '😤', '😭', '😡', '😬', '😐', '😶', '🙄',
    ],
  },
  {
    id: 'body',
    labelKey: 'habits.form.emojiCategoryBody',
    searchTerms: 'people body hands strength social connection health mind brain heart',
    emojis: [
      '👋', '👏', '🙌', '🙏', '💪', '🤝', '👍', '👎', '✌️', '🤞', '🫶', '🤟',
      '👀', '🧠', '🫀', '🫁', '🦷', '🦴', '👣', '🗣️', '👤', '👥', '🧍', '🚶',
      '🏃', '🧎', '💃', '🕺', '🧘', '🛌', '🧑‍💻', '🧑‍🍳', '🧑‍🎨', '🧑‍🏫', '🧑‍🔬', '🧑‍⚕️',
    ],
  },
  {
    id: 'wellness',
    labelKey: 'habits.form.emojiCategoryWellness',
    searchTerms: 'wellness fitness exercise run walk gym yoga meditate water medicine sleep therapy self care habit',
    emojis: [
      '🏃‍♀️', '🏃‍♂️', '🚶‍♀️', '🚶‍♂️', '🧘‍♀️', '🧘‍♂️', '🏋️‍♀️', '🏋️‍♂️', '🤸', '🤸‍♀️', '🤸‍♂️', '🚴',
      '🚴‍♀️', '🚴‍♂️', '🏊', '🏊‍♀️', '🏊‍♂️', '🧗', '🧗‍♀️', '🧗‍♂️', '🛀', '🛌', '💧', '🥛',
      '💊', '🩹', '🩺', '🧴', '🪥', '🧼', '🧽', '🫧', '🕯️', '🪷', '🌿', '🍃',
    ],
  },
  {
    id: 'nature',
    labelKey: 'habits.form.emojiCategoryNature',
    searchTerms: 'nature plants weather outdoors garden growth sun moon water fire earth pet animal',
    emojis: [
      '🌱', '🌿', '☘️', '🍀', '🪴', '🌵', '🌴', '🌳', '🌲', '🌷', '🌸', '🌼',
      '🌻', '🍄', '🌞', '☀️', '🌙', '⭐️', '🌟', '✨', '🌈', '🔥', '💧', '🌊',
      '❄️', '⚡️', '🌍', '🌕', '🌧️', '☁️', '🐶', '🐱', '🐦', '🦋', '🐝', '🐢',
    ],
  },
  {
    id: 'food',
    labelKey: 'habits.form.emojiCategoryFood',
    searchTerms: 'food drink nutrition diet meal cook coffee tea fruit vegetable hydrate water protein',
    emojis: [
      '🍎', '🍌', '🍊', '🍋', '🍓', '🫐', '🍇', '🍉', '🍍', '🥝', '🥑', '🥦',
      '🥕', '🌽', '🥗', '🍞', '🥚', '🍳', '🥘', '🍲', '🍜', '🍣', '🍛', '🍝',
      '🥣', '🥜', '🍯', '☕️', '🍵', '🧃', '🥤', '🧋', '🍼', '🍽️', '🥄', '🔪',
    ],
  },
  {
    id: 'activities',
    labelKey: 'habits.form.emojiCategoryActivities',
    searchTerms: 'activities sports hobbies creative music game art practice train play',
    emojis: [
      '⚽️', '🏀', '🏈', '⚾️', '🎾', '🏐', '🏓', '🏸', '🥊', '🥋', '🛹', '⛸️',
      '🎯', '🎮', '🎲', '🧩', '♟️', '🎨', '🖌️', '✏️', '🎸', '🎹', '🥁', '🎧',
      '🎤', '🎬', '📷', '📹', '🧶', '🪡', '🎣', '⛳️', '🏆', '🥇', '🎟️', '🎭',
    ],
  },
  {
    id: 'work',
    labelKey: 'habits.form.emojiCategoryWork',
    searchTerms: 'work study school reading writing plan calendar productivity focus admin finance learn',
    emojis: [
      '📚', '📖', '✍️', '📝', '📓', '📔', '📒', '📕', '📗', '📘', '📙', '💻',
      '⌨️', '🖥️', '📱', '🗓️', '📅', '⏰', '⏳', '⌛️', '📌', '📎', '✂️', '📁',
      '📂', '📊', '📈', '📉', '🔍', '💡', '🧪', '🧮', '🧾', '💰', '💳', '🏦',
    ],
  },
  {
    id: 'home',
    labelKey: 'habits.form.emojiCategoryHome',
    searchTerms: 'home chores clean organize laundry shopping repair car family house routine',
    emojis: [
      '🏠', '🏡', '🧹', '🧺', '🧼', '🛁', '🛏️', '🛋️', '🍽️', '🧽', '🪣', '🛒',
      '🧾', '🔑', '🚗', '🚙', '📦', '🧰', '🔧', '🪛', '🔨', '🧱', '🪜', '🧯',
      '🪫', '🔋', '💡', '🧸', '🎁', '🪴', '🗑️', '🚿', '🧻', '🪞', '🚪', '🪟',
    ],
  },
  {
    id: 'travel',
    labelKey: 'habits.form.emojiCategoryTravel',
    searchTerms: 'travel commute outside places trip walk drive bike train plane map direction',
    emojis: [
      '🚶', '🚗', '🚕', '🚌', '🚆', '🚇', '✈️', '🚲', '🛴', '⛵️', '🚢', '🏕️',
      '🏖️', '🏔️', '🏙️', '🌅', '🌄', '🗺️', '🧭', '🎒', '🧳', '🎫', '🛤️', '🛣️',
      '⛽️', '🚦', '🏟️', '🏛️', '⛩️', '🕌', '⛪️', '🛍️', '🏪', '🏥', '🏫', '🏢',
    ],
  },
  {
    id: 'symbols',
    labelKey: 'habits.form.emojiCategorySymbols',
    searchTerms: 'symbols status color heart check star fire goal alert stop yes no priority',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '💯', '✅',
      '☑️', '✔️', '❌', '⭕️', '🚫', '⚠️', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣',
      '⚪️', '⚫️', '🟤', '⭐️', '🌟', '✨', '🔥', '🎯', '📍', '🔔', '🔒', '🔓',
    ],
  },
] as const

export const HABIT_EMOJI_OPTIONS: readonly string[] = Array.from(
  new Set(HABIT_EMOJI_CATEGORIES.flatMap((category) => category.emojis)),
)

export type HabitEmojiOption = string

const HABIT_EMOJI_KEYWORDS: Readonly<Record<string, string>> = {
  '✨': 'sparkle magic special fresh start default',
  '🌱': 'plant growth new habit seed sprout',
  '💧': 'water hydrate hydration drink',
  '🏃': 'run running exercise cardio workout',
  '🏃‍♀️': 'run running exercise cardio workout',
  '🏃‍♂️': 'run running exercise cardio workout',
  '🚶': 'walk walking steps commute',
  '🧘': 'meditate meditation yoga calm mindfulness',
  '🧘‍♀️': 'meditate meditation yoga calm mindfulness',
  '🧘‍♂️': 'meditate meditation yoga calm mindfulness',
  '💪': 'strength workout gym fitness muscle',
  '🥗': 'salad healthy food nutrition diet',
  '😴': 'sleep rest bedtime night',
  '📚': 'read reading books study learn',
  '✍️': 'write writing journal note',
  '🎯': 'goal target focus aim',
  '🔥': 'streak fire intense priority',
  '☕️': 'coffee caffeine morning',
  '🧹': 'clean chores tidy home',
  '💊': 'medicine medication pill health',
  '🪴': 'plant garden home growth',
  '❤️': 'heart love care',
  '🚭': 'quit smoking no smoke bad habit',
  '🍎': 'apple fruit healthy food',
  '🕯️': 'candle calm ritual meditation',
  '🧊': 'ice cold shower discipline',
  '💻': 'computer work code programming',
  '📝': 'notes tasks write plan',
  '📅': 'calendar schedule date plan',
  '⏰': 'alarm time morning reminder',
  '💰': 'money budget finance',
  '🛒': 'shopping groceries errands',
  '🏠': 'home house chores',
}

function normalizeEmojiSearch(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function emojiMatchesSearch(emoji: string, category: HabitEmojiCategory, query: string): boolean {
  const keywords = HABIT_EMOJI_KEYWORDS[emoji] ?? ''
  return `${emoji} ${category.id} ${category.searchTerms} ${keywords}`
    .toLocaleLowerCase()
    .includes(query)
}

export function filterHabitEmojiCategories(query: string): readonly HabitEmojiCategory[] {
  const normalizedQuery = normalizeEmojiSearch(query)
  if (!normalizedQuery) return HABIT_EMOJI_CATEGORIES

  return HABIT_EMOJI_CATEGORIES
    .map((category) => ({
      ...category,
      emojis: category.emojis.filter((emoji) => emojiMatchesSearch(emoji, category, normalizedQuery)),
    }))
    .filter((category) => category.emojis.length > 0)
}

export function resolveHabitEmoji(emoji: string | null | undefined): string {
  const normalized = emoji?.trim()
  return normalized && normalized.length > 0 ? normalized : DEFAULT_HABIT_EMOJI
}
