type DesktopRuntime = { invoke: (command: string, payload: Record<string, unknown>) => Promise<unknown> }

export function desktopRuntime(): DesktopRuntime | undefined {
  return typeof window === 'undefined' ? undefined : (window as Window & { __TAURI_INTERNALS__?: DesktopRuntime }).__TAURI_INTERNALS__
}

export function isDesktopPush(): boolean { return desktopRuntime() !== undefined }


export function desktopCommandSupported(command: string): boolean {
  if (!desktopRuntime()) return false
  const commands = (window as Window & { __ORBIT_DESKTOP_COMMANDS__?: unknown }).__ORBIT_DESKTOP_COMMANDS__
  return Array.isArray(commands) && commands.includes(command)
}
