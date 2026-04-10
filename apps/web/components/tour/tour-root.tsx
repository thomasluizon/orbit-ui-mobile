'use client'

import { TourProvider } from './tour-provider'
import { TourOverlay } from './tour-overlay'

/**
 * Root-level tour wrapper. Place in the root layout so it persists
 * across all route groups (app, chat, etc.) without remounting.
 */
export function TourRoot() {
  return (
    <>
      <TourProvider />
      <TourOverlay />
    </>
  )
}
