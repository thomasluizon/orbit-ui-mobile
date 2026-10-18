export const PROMPT_CATEGORIES = ['start', 'remember', 'many', 'restart', 'understand', 'calendar'] as const
export type PromptCategory = (typeof PROMPT_CATEGORIES)[number]
export type PromptTemplate = { id: string; category: PromptCategory; labelKey: string; promptKey: string }
export const PROMPT_PAGE_SIZE = 8

export type PromptFilters = { category: PromptCategory; query: string; page: number }
export type PromptFilterAction =
  | { type: 'reset' }
  | { type: 'category'; category: PromptCategory }
  | { type: 'query'; query: string }
  | { type: 'page'; page: number }

export const INITIAL_PROMPT_FILTERS: PromptFilters = { category: 'start', query: '', page: 0 }

export function reducePromptFilters(state: PromptFilters, action: PromptFilterAction): PromptFilters {
  switch (action.type) {
    case 'reset': return INITIAL_PROMPT_FILTERS
    case 'category': return { category: action.category, query: '', page: 0 }
    case 'query': return { ...state, query: action.query, page: 0 }
    case 'page': return { ...state, page: action.page }
  }
}

export const PROMPT_TEMPLATES: readonly PromptTemplate[] = [
  { id: 'morning', category: 'start', labelKey: 'chat.templates.items.morning.label', promptKey: 'chat.templates.items.morning.prompt' },
  { id: 'evening', category: 'start', labelKey: 'chat.templates.items.evening.label', promptKey: 'chat.templates.items.evening.prompt' },
  { id: 'oneHabit', category: 'start', labelKey: 'chat.templates.items.oneHabit.label', promptKey: 'chat.templates.items.oneHabit.prompt' },
  { id: 'goalHabits', category: 'start', labelKey: 'chat.templates.items.goalHabits.label', promptKey: 'chat.templates.items.goalHabits.prompt' },
  { id: 'habitReminder', category: 'start', labelKey: 'chat.templates.items.habitReminder.label', promptKey: 'chat.templates.items.habitReminder.prompt' },
  { id: 'smallSteps', category: 'start', labelKey: 'chat.templates.items.smallSteps.label', promptKey: 'chat.templates.items.smallSteps.prompt' },
  { id: 'setReminder', category: 'remember', labelKey: 'chat.templates.items.setReminder.label', promptKey: 'chat.templates.items.setReminder.prompt' },
  { id: 'changeReminder', category: 'remember', labelKey: 'chat.templates.items.changeReminder.label', promptKey: 'chat.templates.items.changeReminder.prompt' },
  { id: 'dueToday', category: 'remember', labelKey: 'chat.templates.items.dueToday.label', promptKey: 'chat.templates.items.dueToday.prompt' },
  { id: 'tonight', category: 'remember', labelKey: 'chat.templates.items.tonight.label', promptKey: 'chat.templates.items.tonight.prompt' },
  { id: 'reviewReminders', category: 'remember', labelKey: 'chat.templates.items.reviewReminders.label', promptKey: 'chat.templates.items.reviewReminders.prompt' },
  { id: 'busyReminders', category: 'remember', labelKey: 'chat.templates.items.busyReminders.label', promptKey: 'chat.templates.items.busyReminders.prompt' },
  { id: 'moveToday', category: 'many', labelKey: 'chat.templates.items.moveToday.label', promptKey: 'chat.templates.items.moveToday.prompt' },
  { id: 'changeTimes', category: 'many', labelKey: 'chat.templates.items.changeTimes.label', promptKey: 'chat.templates.items.changeTimes.prompt' },
  { id: 'skipToday', category: 'many', labelKey: 'chat.templates.items.skipToday.label', promptKey: 'chat.templates.items.skipToday.prompt' },
  { id: 'logMany', category: 'many', labelKey: 'chat.templates.items.logMany.label', promptKey: 'chat.templates.items.logMany.prompt' },
  { id: 'tagGroup', category: 'many', labelKey: 'chat.templates.items.tagGroup.label', promptKey: 'chat.templates.items.tagGroup.prompt' },
  { id: 'pauseMany', category: 'many', labelKey: 'chat.templates.items.pauseMany.label', promptKey: 'chat.templates.items.pauseMany.prompt' },
  { id: 'afterDay', category: 'restart', labelKey: 'chat.templates.items.afterDay.label', promptKey: 'chat.templates.items.afterDay.prompt' },
  { id: 'afterWeek', category: 'restart', labelKey: 'chat.templates.items.afterWeek.label', promptKey: 'chat.templates.items.afterWeek.prompt' },
  { id: 'smallerHabit', category: 'restart', labelKey: 'chat.templates.items.smallerHabit.label', promptKey: 'chat.templates.items.smallerHabit.prompt' },
  { id: 'keepOne', category: 'restart', labelKey: 'chat.templates.items.keepOne.label', promptKey: 'chat.templates.items.keepOne.prompt' },
  { id: 'lighterWeek', category: 'restart', labelKey: 'chat.templates.items.lighterWeek.label', promptKey: 'chat.templates.items.lighterWeek.prompt' },
  { id: 'easierTime', category: 'restart', labelKey: 'chat.templates.items.easierTime.label', promptKey: 'chat.templates.items.easierTime.prompt' },
  { id: 'reviewWeek', category: 'understand', labelKey: 'chat.templates.items.reviewWeek.label', promptKey: 'chat.templates.items.reviewWeek.prompt' },
  { id: 'missedHabit', category: 'understand', labelKey: 'chat.templates.items.missedHabit.label', promptKey: 'chat.templates.items.missedHabit.prompt' },
  { id: 'streak', category: 'understand', labelKey: 'chat.templates.items.streak.label', promptKey: 'chat.templates.items.streak.prompt' },
  { id: 'freezes', category: 'understand', labelKey: 'chat.templates.items.freezes.label', promptKey: 'chat.templates.items.freezes.prompt' },
  { id: 'whatWorks', category: 'understand', labelKey: 'chat.templates.items.whatWorks.label', promptKey: 'chat.templates.items.whatWorks.prompt' },
  { id: 'reviewGoals', category: 'understand', labelKey: 'chat.templates.items.reviewGoals.label', promptKey: 'chat.templates.items.reviewGoals.prompt' },
  { id: 'aroundEvents', category: 'calendar', labelKey: 'chat.templates.items.aroundEvents.label', promptKey: 'chat.templates.items.aroundEvents.prompt' },
  { id: 'importWeek', category: 'calendar', labelKey: 'chat.templates.items.importWeek.label', promptKey: 'chat.templates.items.importWeek.prompt' },
  { id: 'todayEvents', category: 'calendar', labelKey: 'chat.templates.items.todayEvents.label', promptKey: 'chat.templates.items.todayEvents.prompt' },
  { id: 'findTime', category: 'calendar', labelKey: 'chat.templates.items.findTime.label', promptKey: 'chat.templates.items.findTime.prompt' },
  { id: 'tomorrow', category: 'calendar', labelKey: 'chat.templates.items.tomorrow.label', promptKey: 'chat.templates.items.tomorrow.prompt' },
  { id: 'busyDay', category: 'calendar', labelKey: 'chat.templates.items.busyDay.label', promptKey: 'chat.templates.items.busyDay.prompt' },
]

export function promptCategories(hasProAccess: boolean, hasGoogleConnection: boolean): readonly PromptCategory[] {
  return PROMPT_CATEGORIES.filter(category => category !== 'calendar' || (hasProAccess && hasGoogleConnection))
}

export function filterPromptTemplates(options: {
  category: PromptCategory
  query: string
  locale: string
  categories: readonly PromptCategory[]
  translate: (key: string) => string
}): readonly PromptTemplate[] {
  const normalize = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase(options.locale)
  const query = normalize(options.query.trim())
  return PROMPT_TEMPLATES.filter(template => options.categories.includes(template.category)
    && (query ? normalize(`${options.translate(template.labelKey)} ${options.translate(template.promptKey)}`).includes(query)
      : template.category === options.category))
}

export function buildPromptPage(options: {
  filters: PromptFilters
  locale: string
  hasProAccess: boolean
  hasGoogleConnection: boolean
  translate: (key: string) => string
}): {
  categories: readonly PromptCategory[]; activeCategory: PromptCategory
  matches: readonly PromptTemplate[]; visible: readonly PromptTemplate[]; currentPage: number; lastPage: number
} {
  const { category, query, page } = options.filters
  const categories = promptCategories(options.hasProAccess, options.hasGoogleConnection)
  const activeCategory = categories.includes(category) ? category : 'start'
  const matches = filterPromptTemplates({ ...options, category: activeCategory, query, categories })
  const lastPage = Math.max(0, Math.ceil(matches.length / PROMPT_PAGE_SIZE) - 1)
  const currentPage = Math.min(page, lastPage)
  return { categories, activeCategory, matches, lastPage, currentPage,
    visible: matches.slice(currentPage * PROMPT_PAGE_SIZE, (currentPage + 1) * PROMPT_PAGE_SIZE) }
}
