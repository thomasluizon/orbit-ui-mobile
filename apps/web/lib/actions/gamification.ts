'use client'

import * as serverActions from '@/app/actions/gamification'
import { bindAccountServerAction } from '@/lib/client-action'

export const reportAchievementEvent = bindAccountServerAction(serverActions.reportAchievementEvent)
