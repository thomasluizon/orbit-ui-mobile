'use client'

import * as serverActions from '@/app/actions/profile'
import { bindAccountServerAction, bindServerAction } from '@/lib/client-action'

export const updateName = bindAccountServerAction(serverActions.updateName)
export const updateTimezone = bindAccountServerAction(serverActions.updateTimezone)
export const updateLanguage = bindAccountServerAction(serverActions.updateLanguage)
export const updateAiSummary = bindAccountServerAction(serverActions.updateAiSummary)
export const updateProactiveAstra = bindAccountServerAction(serverActions.updateProactiveAstra)
export const updateMarketingConsent = bindAccountServerAction(serverActions.updateMarketingConsent)
export const updateWeekStartDay = bindAccountServerAction(serverActions.updateWeekStartDay)
export const updateThemePreference = bindAccountServerAction(serverActions.updateThemePreference)
export const updateColorScheme = bindAccountServerAction(serverActions.updateColorScheme)
export const completeOnboarding = bindAccountServerAction(serverActions.completeOnboarding)
export const completeTour = bindAccountServerAction(serverActions.completeTour)
export const resetTour = bindAccountServerAction(serverActions.resetTour)
export const resetAccount = bindAccountServerAction(serverActions.resetAccount)
export const exportUserData = bindServerAction(serverActions.exportUserData)
