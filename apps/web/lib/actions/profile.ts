'use client'

import * as serverActions from '@/app/actions/profile'
import { bindServerAction } from '@/lib/client-action'

export const updateName = bindServerAction(serverActions.updateName)
export const updateTimezone = bindServerAction(serverActions.updateTimezone)
export const updateLanguage = bindServerAction(serverActions.updateLanguage)
export const updateAiSummary = bindServerAction(serverActions.updateAiSummary)
export const updateProactiveAstra = bindServerAction(serverActions.updateProactiveAstra)
export const updateMarketingConsent = bindServerAction(serverActions.updateMarketingConsent)
export const updateWeekStartDay = bindServerAction(serverActions.updateWeekStartDay)
export const updateThemePreference = bindServerAction(serverActions.updateThemePreference)
export const updateColorScheme = bindServerAction(serverActions.updateColorScheme)
export const completeOnboarding = bindServerAction(serverActions.completeOnboarding)
export const completeTour = bindServerAction(serverActions.completeTour)
export const resetTour = bindServerAction(serverActions.resetTour)
export const resetAccount = bindServerAction(serverActions.resetAccount)
export const exportUserData = bindServerAction(serverActions.exportUserData)
