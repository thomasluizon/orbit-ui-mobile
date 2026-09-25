'use client'

import * as serverActions from '@/app/actions/onboarding'
import { bindAccountServerAction } from '@/lib/client-action'

export const applyOnboarding = bindAccountServerAction(serverActions.applyOnboarding)
export const dismissImportPrompt = bindAccountServerAction(serverActions.dismissImportPrompt)
