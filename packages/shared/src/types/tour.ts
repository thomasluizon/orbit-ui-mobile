// ---------------------------------------------------------------------------
// Tour types -- shared across web and mobile
// ---------------------------------------------------------------------------

export type TourSection = 'habits' | 'goals' | 'chat' | 'calendar' | 'profile'

export type TourPlacement = 'top' | 'bottom' | 'left' | 'right'

export interface TourStep {
  /** Unique step identifier */
  id: string
  /** Which section this step belongs to */
  section: TourSection
  /** Matches `data-tour="xxx"` on web or registered ref on mobile */
  targetId: string
  /** i18n key for the tooltip title */
  titleKey: string
  /** i18n key for the tooltip description */
  descriptionKey: string
  /** Preferred tooltip placement relative to the target */
  placement: TourPlacement
  /** Page route the target lives on */
  route: string
  /** Whether to show a Pro badge on this step */
  proBadge?: boolean
  /** Action to perform before spotlighting (e.g. switch tab) */
  preAction?: TourPreAction
}

export type TourPreAction =
  | 'switchToGoalsTab'
  | 'switchToTodayTab'

export const TOUR_SECTIONS: TourSection[] = [
  'habits',
  'goals',
  'chat',
  'calendar',
  'profile',
]

export const TOUR_SECTION_ICONS: Record<TourSection, string> = {
  habits: 'check-circle',
  goals: 'target',
  chat: 'message-circle',
  calendar: 'calendar-days',
  profile: 'user',
}
