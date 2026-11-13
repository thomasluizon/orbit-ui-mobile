import { desktopRuntime } from '@/lib/desktop-runtime'

export type DesktopWindowPlatform = 'windows' | 'macos'
export type DesktopWindowAction = 'state' | 'drag' | 'minimize' | 'toggle_maximize' | 'close'

/** The shell marks the root element with this attribute at document creation, and only a shell without a native title bar does. */
export const DESKTOP_WINDOW_BAR_ATTRIBUTE = 'data-desktop-window-bar'

/** Matches the native hit region of the maximize action in `native/windows/caption.cpp`. */
export const DESKTOP_WINDOW_BAR_HEIGHT = 48
export const DESKTOP_WINDOW_CONTROL_WIDTH = 44
export const DESKTOP_WINDOW_BAR_END_INSET = 4

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
