'use client'

import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { captureException } from '@sentry/nextjs'
import compatibility from '@/web-compatibility.json'
import { desktopShellVersion, shellSupportsWeb } from '@/lib/desktop-web-release'
import { watchDesktopUpdates, desktopOffersSupported } from '@/lib/desktop-updates'
import { UpdateAvailableBanner } from '@/components/ui/update-available-banner'
import { takeDesktopChatCheckpoint } from '@/lib/desktop-chat-checkpoint'
import { useHeldAccountId } from '@/stores/auth-store'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'
import { ErrorState } from '@/components/ui/error-state'

function subscribeToShellVersion() { return () => {} }
function serverShellVersion() { return null }

export function DesktopReleaseShell({ onUpdateRequired, monitor = false, minimum = compatibility.minimumShellVersion }: Readonly<{
  onUpdateRequired: (update: ReactNode) => void
  monitor?: boolean
  minimum?: string
}>) {
  const version = useSyncExternalStore(subscribeToShellVersion, desktopShellVersion, serverShellVersion)
  const [required, setRequired] = useState(minimum)
  const compatible = version === null || shellSupportsWeb(version, required)

  useEffect(() => {
    onUpdateRequired(compatible ? null : <DesktopUpdateRequired />)
  }, [compatible, onUpdateRequired])

  return (compatible || desktopOffersSupported()) && monitor && version !== null
    ? <DesktopReleaseMonitor version={version} requireUpgrade={setRequired} />
    : null
}

function DesktopReleaseMonitor({ version, requireUpgrade }: Readonly<{ version: string; requireUpgrade: (minimum: string) => void }>) {
  const accountId = useHeldAccountId()
  useEffect(() => {
    try {
      const checkpoint = accountId ? takeDesktopChatCheckpoint(accountId) : null
      if (checkpoint) {
        useChatStore.setState({ ...checkpoint.chat, draftHydrated: true, isTyping: false, streamingMessageId: null })
        useUIStore.getState().setAstraConversationOpen(checkpoint.conversationOpen)
      }
    } catch (error) { captureException(error) }
    return watchDesktopUpdates(version, process.env.NEXT_PUBLIC_WEB_COMMIT_SHA ?? null, requireUpgrade)
  }, [accountId, requireUpgrade, version])
  return null
}

function DesktopUpdateRequired() {
  const t = useTranslations()
  return <main className="flex min-h-dvh items-center justify-center bg-[var(--bg)] text-[var(--fg-1)]">
    <div className="flex max-w-[440px] flex-col gap-4 p-4"><ErrorState message={t('desktopUpdate.required')} /><UpdateAvailableBanner inset={false} /></div>
  </main>
}
