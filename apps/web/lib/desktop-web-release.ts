import { z } from 'zod'
import { captureException } from '@sentry/nextjs'
import { isNetworkUnavailableError } from '@orbit/shared/utils'
import { getQueryClient } from '@/lib/query-client'
import { getHeldAccountId } from '@/stores/auth-store'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'
import { writeDesktopChatCheckpoint } from './desktop-chat-checkpoint'
import { forgetDesktopChatCheckpoint, hasWebReloadBlockers } from './web-reload-state'

export const shellVersionSchema = z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/)
  .refine(version => version.split('.').every(part => Number.isSafeInteger(Number(part))))
export const desktopWebReleaseSchema = z.object({
  commit: z.string().regex(/^[a-f0-9]{40}$/).nullable(),
  minimumShellVersion: shellVersionSchema,
})

export function desktopShellVersion(): string | null {
  if (!('__TAURI_INTERNALS__' in window)) return null
  const version = shellVersionSchema.safeParse(
    (window as Window & { __ORBIT_DESKTOP_VERSION__?: unknown }).__ORBIT_DESKTOP_VERSION__,
  )
  return version.success ? version.data : '0.0.0'
}

export function shellSupportsWeb(version: string, minimum: string): boolean {
  const current = shellVersionSchema.parse(version).split('.').map(Number)
  const required = shellVersionSchema.parse(minimum).split('.').map(Number)
  const changed = current.findIndex((part, index) => part !== required[index])
  return changed === -1 || current[changed]! > required[changed]!
}

function holdsUnsavedInput(element: Element) {
  return !element.closest('[data-desktop-reload-safe]')
}

export function canReloadDesktopWeb() {
  const chat = useChatStore.getState()
  const ui = useUIStore.getState()
  const focused = document.activeElement
  const editing = focused?.matches('input, textarea, select, [contenteditable="true"]') && holdsUnsavedInput(focused)
  return navigator.onLine && !chat.isTyping && chat.streamingMessageId === null && !hasWebReloadBlockers()
    && getQueryClient().isMutating() === 0 && !ui.showCreateModal && ui.openOverlayIds.length === 0
    && ui.selectedHabitIds.size === 0 && !editing && ![...document.querySelectorAll('form')].some(holdsUnsavedInput)
}

export async function reloadDesktopWeb(reload: () => void | Promise<void>, persistent = false) {
  const accountId = getHeldAccountId()
  if (!canReloadDesktopWeb()) return false
  if (!accountId) { await reload(); return true }
  const chat = useChatStore.getState()
  const ui = useUIStore.getState()
  const written = await writeDesktopChatCheckpoint(accountId, chat, ui.astraConversationOpen, persistent)
  if (getHeldAccountId() !== accountId || chat !== useChatStore.getState()
    || ui !== useUIStore.getState() || !canReloadDesktopWeb()) {
    if (written) forgetDesktopChatCheckpoint()
    return false
  }
  await reload()
  return true
}

export function watchDesktopWebRelease(version: string, commit: string | null, onAvailable: (release: z.infer<typeof desktopWebReleaseSchema>) => void) {
  let stopped = false
  let checking = false
  let announced: string | null = null
  let pending: z.infer<typeof desktopWebReleaseSchema> | null = null
  const controller = new AbortController()

  async function check() {
    if (checking || stopped) return
    checking = true
    const pollSignal = AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)])
    try {
      const response = await fetch('/api/desktop-release', { cache: 'no-store', signal: pollSignal })
      if (!response.ok) throw new Error(`Cannot check desktop web release: ${response.status}`)
      const release = desktopWebReleaseSchema.parse(await response.json())
      if (!controller.signal.aborted) pending = release
    } catch (error) {
      if (!pollSignal.aborted && !isNetworkUnavailableError(error)) captureException(error)
    } finally { checking = false }
  }

  function offer() {
    const release = pending
    if (!release || stopped) return
    const incompatible = !shellSupportsWeb(version, release.minimumShellVersion)
    if (!incompatible && (!release.commit || release.commit === commit)) return
    if (!canReloadDesktopWeb()) return
    const key = JSON.stringify(release)
    if (key === announced) return
    announced = key
    onAvailable(release)
  }

  void check()
  const scheduleCheck = () => { void check() }
  const poll = setInterval(scheduleCheck, 60_000)
  const notice = setInterval(offer, 1000)
  window.addEventListener('focus', scheduleCheck)
  window.addEventListener('online', scheduleCheck)
  return () => {
    stopped = true
    controller.abort()
    clearInterval(poll)
    clearInterval(notice)
    window.removeEventListener('focus', scheduleCheck)
    window.removeEventListener('online', scheduleCheck)
  }
}
