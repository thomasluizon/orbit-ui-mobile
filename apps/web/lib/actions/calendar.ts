'use client'

import * as serverActions from '@/app/actions/calendar'
import { bindServerAction } from '@/lib/client-action'

export const getUserCalendars = bindServerAction(serverActions.getUserCalendars)
export const setSelectedCalendars = bindServerAction(serverActions.setSelectedCalendars)
export const setCalendarAutoSync = bindServerAction(serverActions.setCalendarAutoSync)
export const runCalendarSyncNow = bindServerAction(serverActions.runCalendarSyncNow)
export const dismissCalendarSuggestion = bindServerAction(serverActions.dismissCalendarSuggestion)
export const dismissCalendarImport = bindServerAction(serverActions.dismissCalendarImport)
