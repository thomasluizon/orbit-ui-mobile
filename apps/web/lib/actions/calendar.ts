'use client'

import * as serverActions from '@/app/actions/calendar'
import { bindAccountServerAction, bindServerAction } from '@/lib/client-action'

export const getUserCalendars = bindServerAction(serverActions.getUserCalendars)
export const setSelectedCalendars = bindAccountServerAction(serverActions.setSelectedCalendars)
export const setCalendarAutoSync = bindAccountServerAction(serverActions.setCalendarAutoSync)
export const runCalendarSyncNow = bindAccountServerAction(serverActions.runCalendarSyncNow)
export const dismissCalendarSuggestion = bindAccountServerAction(serverActions.dismissCalendarSuggestion)
export const dismissCalendarImport = bindAccountServerAction(serverActions.dismissCalendarImport)
