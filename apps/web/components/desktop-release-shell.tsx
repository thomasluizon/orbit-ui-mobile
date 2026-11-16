'use client'

import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { reportModuleLoadError } from '@/lib/report-module-load-error'
import compatibility from '@/web-compatibility.json'
import { desktopShellVersion, shellSupportsWeb } from '@/lib/desktop-web-release'
import { watchDesktopUpdates, desktopOffersSupported } from '@/lib/desktop-updates'
import { UpdateAvailableBanner } from '@/components/ui/update-available-banner'
import { blockDesktopWebReload } from '@/lib/web-reload-state'
import { getAccountGeneration } from '@/lib/session-epoch'
import { takeDesktopChatCheckpoint } from '@/lib/desktop-chat-checkpoint'
import { useHeldAccountId } from '@/stores/auth-store'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'
import { ErrorState } from '@/components/ui/error-state'

function subscribeToShellVersion() { return () => {} }
function serverShellVersion() { return null }

export function DesktopReleaseShell({ onUpdateRequired, monitor = false, signIn = false, minimum = signIn ? compatibility.signInMinimumShellVersion : compatibility.minimumShellVersion }: Readonly<{
  onUpdateRequired: (update: ReactNode) => void
  monitor?: boolean
  signIn?: boolean
  minimum?: string
}>) {
  const version = useSyncExternalStore(subscribeToShellVersion, desktopShellVersion, serverShellVersion)
  const [required, setRequired] = useState(minimum)
  const compatible = version === null || shellSupportsWeb(version, required)

  useEffect(() => {
    onUpdateRequired(compatible ? null : <DesktopUpdateRequired signIn={signIn} />)
  }, [compatible, onUpdateRequired, signIn])

  return (compatible || desktopOffersSupported()) && monitor && version !== null
    ? <DesktopReleaseMonitor version={version} requireUpgrade={setRequired} />
    : null
}

function DesktopReleaseMonitor({ version, requireUpgrade }: Readonly<{ version: string; requireUpgrade: (minimum: string) => void }>) {
  const accountId = useHeldAccountId()
  useEffect(() => {
    let current = true
    const unblockReload = blockDesktopWebReload()
    if (accountId) void restoreDesktopCheckpoint(accountId, () => current).catch(reportModuleLoadError).finally(unblockReload)
    else unblockReload()
    const stopWatching = watchDesktopUpdates(version, process.env.NEXT_PUBLIC_WEB_COMMIT_SHA ?? null, requireUpgrade)
    return () => { current = false; unblockReload(); stopWatching() }
  }, [accountId, requireUpgrade, version])
  return null
}

async function restoreDesktopCheckpoint(accountId: string, isCurrent: () => boolean) {
  const accountGeneration = getAccountGeneration()
  const snapshot = useChatStore.getState()
  const conversationOpen = useUIStore.getState().astraConversationOpen
  const checkpoint = await takeDesktopChatCheckpoint(accountId, () => isCurrent() && accountGeneration === getAccountGeneration())
  const current = useChatStore.getState()
  if (!checkpoint || !isCurrent() || accountGeneration !== getAccountGeneration()) return
  const draft = current.draftRevision === snapshot.draftRevision ? checkpoint.chat.draft : current.draft
  useChatStore.setState({
    ...(current.messages === snapshot.messages ? { ...checkpoint.chat, isTyping: false, streamingMessageId: null } : {}),
    draft, draftHydrated: true,
  })
  if (useUIStore.getState().astraConversationOpen === conversationOpen) useUIStore.getState().setAstraConversationOpen(checkpoint.conversationOpen)
}

function DesktopUpdateRequired({ signIn }: Readonly<{ signIn: boolean }>) {
  const t = useTranslations()
  return <main className="flex min-h-dvh items-center justify-center bg-[var(--bg)] pt-[var(--safe-top)] text-[var(--fg-1)]">
    <div className="flex max-w-[440px] flex-col gap-4 p-4"><ErrorState message={t(signIn ? 'desktopUpdate.signInRequired' : 'desktopUpdate.required')} /><UpdateAvailableBanner inset={false} /></div>
  </main>
}
