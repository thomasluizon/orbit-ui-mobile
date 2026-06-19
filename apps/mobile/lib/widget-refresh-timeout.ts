/**
 * Deadline after which the home-screen widget refresh spinner is force-cleared even
 * if the native `onDataSetChanged` callback never fires, bounding the ColorOS binder
 * fetch hang. Set above the native fetch's 5s connect + 5s read budget (10s) so a
 * genuinely slow-but-succeeding fetch still wins the race and paints real data before
 * the fallback fires. Mirrored as `WIDGET_REFRESH_TIMEOUT_MS` in OrbitWidgetProvider.kt.
 */
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
