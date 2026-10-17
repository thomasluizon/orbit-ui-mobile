export const PROGRESS_SUBMENUS = [
  { id: 'streak', route: '/progress/streak', labelKey: 'progressScreen.sections.streak', icon: 'flame', descriptionKey: null },
  { id: 'goals', route: '/progress/goals', labelKey: 'progressScreen.sections.goals', icon: 'target', descriptionKey: null },
  { id: 'achievements', route: '/progress/achievements', labelKey: 'progressScreen.sections.achievements', icon: 'trophy', descriptionKey: 'progressScreen.achievements.destination' },
] as const

export type ProgressSubmenuId = typeof PROGRESS_SUBMENUS[number]['id']
