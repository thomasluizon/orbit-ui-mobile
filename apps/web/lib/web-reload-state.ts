export const desktopChatCheckpointKey = 'orbit-desktop-web-reload'
const reloadBlockers = new Set<symbol>()

export function blockDesktopWebReload() {
  const blocker = Symbol()
  reloadBlockers.add(blocker)
  return () => { reloadBlockers.delete(blocker) }
}

export function hasWebReloadBlockers(): boolean { return reloadBlockers.size > 0 }

export function forgetDesktopChatCheckpoint(): void {
  try { globalThis.sessionStorage.removeItem(desktopChatCheckpointKey) }
  finally {
    if (globalThis.localStorage.getItem(desktopChatCheckpointKey) !== null) globalThis.localStorage.removeItem(desktopChatCheckpointKey)
  }
}
