import type { UserCalendar } from '@orbit/shared/types/calendar'
import type { Profile } from '@orbit/shared/types/profile'
import type { HabitTag } from '@orbit/shared/types/habit'
import { mintHermeticJwt as mintSessionJwt } from './hermetic-session.cjs'

export { HERMETIC_SESSION_EXPIRES } from './hermetic-session.cjs'

export const mintHermeticJwt: (profile?: Profile, calendars?: UserCalendar[], tags?: HabitTag[]) => string = mintSessionJwt
