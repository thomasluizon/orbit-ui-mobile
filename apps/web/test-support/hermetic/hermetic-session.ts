import type { UserCalendar } from '@orbit/shared/types/calendar'
import type { Profile } from '@orbit/shared/types/profile'
import { mintHermeticJwt as mintSessionJwt } from './hermetic-session.cjs'

export { HERMETIC_SESSION_EXPIRES } from './hermetic-session.cjs'

export const mintHermeticJwt: (profile?: Profile, calendars?: UserCalendar[]) => string = mintSessionJwt
