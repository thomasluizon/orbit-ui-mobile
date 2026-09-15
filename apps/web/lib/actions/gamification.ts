'use client'

import * as serverActions from '@/app/actions/gamification'
import { bindServerAction } from '@/lib/client-action'

export const reportAchievementEvent = bindServerAction(serverActions.reportAchievementEvent)
