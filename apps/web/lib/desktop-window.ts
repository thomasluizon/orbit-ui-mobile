import { BUTTON_SIZES, SMALL_PILL_VISIBLE_MIN } from '@orbit/shared/theme'
import { desktopRuntime } from '@/lib/desktop-runtime'

export type DesktopWindowPlatform = 'windows' | 'macos'
export type DesktopWindowAction = 'state' | 'drag' | 'minimize' | 'toggle_maximize' | 'close' | 'menu'

/** The shell marks the root element with this attribute at document creation, and only a shell without a native title bar does. */
const DESKTOP_WINDOW_BAR_ATTRIBUTE = 'data-desktop-window-bar'

/**
 * Matches the native hit region of the maximize action in `native/windows/caption.cpp`, and the popup anchor of the menu
 * action in `src/window_bar.rs`: the menu action starts at the end inset, and its menu opens under the bar.
 */
export const DESKTOP_WINDOW_BAR_HEIGHT = 48
export const DESKTOP_WINDOW_BAR_END_INSET = 4
/** Each action is an `IconButton`, which `actionStyle` makes as wide as the larger of the small pill height and the visible minimum. */
export const DESKTOP_WINDOW_CONTROL_WIDTH = Math.max(SMALL_PILL_VISIBLE_MIN, BUTTON_SIZES.sm.height)

/** The room the macOS traffic lights take at the start of the bar. */
export const DESKTOP_WINDOW_TRAFFIC_LIGHT_INSET = 80

export const DESKTOP_MAXIMIZE_HOVER_EVENT = 'orbit-window-maximize-hover'

export function desktopWindowPlatform(): DesktopWindowPlatform | null {
  const platform = document.documentElement.getAttribute(DESKTOP_WINDOW_BAR_ATTRIBUTE)
  return platform === 'windows' || platform === 'macos' ? platform : null
}

export async function invokeDesktopWindow(action: DesktopWindowAction): Promise<boolean> {
  const runtime = desktopRuntime()
  if (!runtime) return false
  return (await runtime.invoke('desktop_window', { action })) === true
}

let mountedBars = 0

/**
 * Tells the shell when the first bar mounts and when the last one unmounts. The Windows shell keeps the window without its
 * native frame only while a bar is drawn (`apps/desktop/src-tauri/src/window_bar.rs`), so a second bar drawn over the
 * first changes nothing.
 */
export function holdDesktopWindowBar(onError: (error: unknown) => void): () => void {
  mountedBars += 1
  if (mountedBars === 1) reportDesktopWindowBar(true, onError)
  return () => {
    mountedBars -= 1
    if (mountedBars === 0) reportDesktopWindowBar(false, onError)
  }
}

function reportDesktopWindowBar(drawn: boolean, onError: (error: unknown) => void) {
  desktopRuntime()?.invoke('desktop_window', { action: 'bar', drawn }).catch(onError)
}
