import { registerChromeLaunchHook } from '@/__tests__/support/chromium'
import { interactionSurfaceSweep } from '@/__tests__/support/interaction-surface-sweep'

interactionSurfaceSweep('/profile', 'en', registerChromeLaunchHook)
