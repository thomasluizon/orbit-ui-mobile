import type { TourStep, TourSection } from '../types/tour'

// ---------------------------------------------------------------------------
// All tour steps, ordered by section
// ---------------------------------------------------------------------------

export const TOUR_STEPS: TourStep[] = [
  // -- Section: Habits (route: /) -------------------------------------------
  {
    id: 'habits-list',
    section: 'habits',
    targetId: 'tour-habit-list',
    titleKey: 'tour.habits.list.title',
    descriptionKey: 'tour.habits.list.description',
    placement: 'bottom',
    route: '/',
    preAction: 'scrollHabitsDown',
  },
  {
    id: 'habits-card',
    section: 'habits',
    targetId: 'tour-habit-card',
    titleKey: 'tour.habits.card.title',
    descriptionKey: 'tour.habits.card.description',
    placement: 'bottom',
    route: '/',
  },
  {
    id: 'habits-tags',
    section: 'habits',
    targetId: 'tour-habit-tags',
    titleKey: 'tour.habits.tags.title',
    descriptionKey: 'tour.habits.tags.description',
    placement: 'bottom',
    route: '/',
  },
  {
    id: 'habits-tabs',
    section: 'habits',
    targetId: 'tour-tabs-bar',
    titleKey: 'tour.habits.tabs.title',
    descriptionKey: 'tour.habits.tabs.description',
    placement: 'bottom',
    route: '/',
    preAction: 'scrollHabitsUp',
  },
  {
    id: 'habits-date-nav',
    section: 'habits',
    targetId: 'tour-date-nav',
    titleKey: 'tour.habits.dateNav.title',
    descriptionKey: 'tour.habits.dateNav.description',
    placement: 'bottom',
    route: '/',
  },
  {
    id: 'habits-fab',
    section: 'habits',
    targetId: 'tour-fab-button',
    titleKey: 'tour.habits.fab.title',
    descriptionKey: 'tour.habits.fab.description',
    placement: 'top',
    route: '/',
  },
  {
    id: 'habits-streak',
    section: 'habits',
    targetId: 'tour-streak-badge',
    titleKey: 'tour.habits.streak.title',
    descriptionKey: 'tour.habits.streak.description',
    placement: 'bottom',
    route: '/',
  },
  {
    id: 'habits-notifications',
    section: 'habits',
    targetId: 'tour-notification-bell',
    titleKey: 'tour.habits.notifications.title',
    descriptionKey: 'tour.habits.notifications.description',
    placement: 'bottom',
    route: '/',
  },

  // -- Section: Goals (route: /, goals tab) ---------------------------------
  {
    id: 'goals-tab',
    section: 'goals',
    targetId: 'tour-goals-tab',
    titleKey: 'tour.goals.tab.title',
    descriptionKey: 'tour.goals.tab.description',
    placement: 'bottom',
    route: '/',
    preAction: 'switchToGoalsTab',
  },
  {
    id: 'goals-card',
    section: 'goals',
    targetId: 'tour-goal-card',
    titleKey: 'tour.goals.card.title',
    descriptionKey: 'tour.goals.card.description',
    placement: 'bottom',
    route: '/',
  },
  {
    id: 'goals-progress',
    section: 'goals',
    targetId: 'tour-goal-progress',
    titleKey: 'tour.goals.progress.title',
    descriptionKey: 'tour.goals.progress.description',
    placement: 'bottom',
    route: '/',
  },

  // -- Section: Chat (route: /chat) -----------------------------------------
  {
    id: 'chat-area',
    section: 'chat',
    targetId: 'tour-chat-area',
    titleKey: 'tour.chat.area.title',
    descriptionKey: 'tour.chat.area.description',
    placement: 'bottom',
    route: '/chat',
  },
  {
    id: 'chat-input',
    section: 'chat',
    targetId: 'tour-chat-input',
    titleKey: 'tour.chat.input.title',
    descriptionKey: 'tour.chat.input.description',
    placement: 'top',
    route: '/chat',
  },
  {
    id: 'chat-suggestions',
    section: 'chat',
    targetId: 'tour-chat-suggestions',
    titleKey: 'tour.chat.suggestions.title',
    descriptionKey: 'tour.chat.suggestions.description',
    placement: 'top',
    route: '/chat',
  },
  {
    id: 'chat-voice',
    section: 'chat',
    targetId: 'tour-chat-voice',
    titleKey: 'tour.chat.voice.title',
    descriptionKey: 'tour.chat.voice.description',
    placement: 'top',
    route: '/chat',
    proBadge: true,
  },

  // -- Section: Calendar (route: /calendar) ---------------------------------
  {
    id: 'calendar-grid',
    section: 'calendar',
    targetId: 'tour-calendar-grid',
    titleKey: 'tour.calendar.grid.title',
    descriptionKey: 'tour.calendar.grid.description',
    placement: 'bottom',
    route: '/calendar',
  },
  {
    id: 'calendar-legend',
    section: 'calendar',
    targetId: 'tour-calendar-legend',
    titleKey: 'tour.calendar.legend.title',
    descriptionKey: 'tour.calendar.legend.description',
    placement: 'top',
    route: '/calendar',
  },
  {
    id: 'calendar-month-nav',
    section: 'calendar',
    targetId: 'tour-calendar-month-nav',
    titleKey: 'tour.calendar.monthNav.title',
    descriptionKey: 'tour.calendar.monthNav.description',
    placement: 'bottom',
    route: '/calendar',
  },
  {
    id: 'calendar-day',
    section: 'calendar',
    targetId: 'tour-calendar-day',
    titleKey: 'tour.calendar.day.title',
    descriptionKey: 'tour.calendar.day.description',
    placement: 'bottom',
    route: '/calendar',
  },

  // -- Section: Profile (route: /profile) -----------------------------------
  {
    id: 'profile-streak',
    section: 'profile',
    targetId: 'tour-profile-streak',
    titleKey: 'tour.profile.streak.title',
    descriptionKey: 'tour.profile.streak.description',
    placement: 'bottom',
    route: '/profile',
  },
  {
    id: 'profile-preferences',
    section: 'profile',
    targetId: 'tour-profile-preferences',
    titleKey: 'tour.profile.preferences.title',
    descriptionKey: 'tour.profile.preferences.description',
    placement: 'bottom',
    route: '/profile',
  },
  {
    id: 'profile-subscription',
    section: 'profile',
    targetId: 'tour-profile-subscription',
    titleKey: 'tour.profile.subscription.title',
    descriptionKey: 'tour.profile.subscription.description',
    placement: 'bottom',
    route: '/profile',
  },
  {
    id: 'profile-retrospective',
    section: 'profile',
    targetId: 'tour-profile-retrospective',
    titleKey: 'tour.profile.retrospective.title',
    descriptionKey: 'tour.profile.retrospective.description',
    placement: 'bottom',
    route: '/profile',
    proBadge: true,
  },
  {
    id: 'profile-achievements',
    section: 'profile',
    targetId: 'tour-profile-achievements',
    titleKey: 'tour.profile.achievements.title',
    descriptionKey: 'tour.profile.achievements.description',
    placement: 'bottom',
    route: '/profile',
    proBadge: true,
  },
]

/** Get all steps for a specific section */
export function getTourStepsBySection(section: TourSection): TourStep[] {
  return TOUR_STEPS.filter((s) => s.section === section)
}

/** Get step count per section */
export function getSectionStepCount(section: TourSection): number {
  return TOUR_STEPS.filter((s) => s.section === section).length
}
