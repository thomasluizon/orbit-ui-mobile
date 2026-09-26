export const WIDGET_REFRESH_TIMEOUT_MS = 12_000

/**
 * Whether the widget refresh fallback should keep the cold-state loading skeleton up:
 * true only when signed in and the habit cache has never synced. Mirrors the native
 * gate in OrbitWidgetProvider.renderWidget and OrbitWidgetFactory.loadWidgetData so the
 * timeout fallback never flips a never-synced widget to a blank card.
 */
export function shouldShowColdSkeleton(
  habitsUpdatedAtMillis: number,
  isSignedOut: boolean,
): boolean {
  return !isSignedOut && habitsUpdatedAtMillis <= 0
}
