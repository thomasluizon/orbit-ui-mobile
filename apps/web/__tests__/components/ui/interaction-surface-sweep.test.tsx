import { registerChromeLaunchHook } from '@/__tests__/support/chromium'
import { destinationInteractionCases, registerInteractionSurfaceSweep } from '@/__tests__/support/destination-interaction-sweep'

registerInteractionSurfaceSweep(destinationInteractionCases.filter(({ width }) => width < 1024), registerChromeLaunchHook, true)
