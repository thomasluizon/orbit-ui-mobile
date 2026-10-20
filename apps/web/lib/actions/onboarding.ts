'use client'

import * as serverActions from '@/app/actions/onboarding'
import { bindServerAction } from '@/lib/client-action'

export const applyOnboarding = bindServerAction(serverActions.applyOnboarding)
export const dismissImportPrompt = bindServerAction(serverActions.dismissImportPrompt)
