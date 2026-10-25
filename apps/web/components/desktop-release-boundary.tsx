'use client'

import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { captureException } from '@sentry/nextjs'
import compatibility from '@/web-compatibility.json'
import { desktopShellVersion, shellSupportsWeb, watchDesktopWebRelease } from '@/lib/desktop-web-release'
import { takeDesktopChatCheckpoint } from '@/lib/desktop-chat-checkpoint'
import { useHeldAccountId } from '@/stores/auth-store'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'
import { ErrorState } from '@/components/ui/error-state'

function subscribeToShellVersion() { return () => {} }
function serverShellVersion() { return null }

export function DesktopReleaseBoundary({ children, monitor = false, minimum = compatibility.minimumShellVersion }: Readonly<{
  children: ReactNode
  monitor?: boolean
  minimum?: string
}>) {
  const version = useSyncExternalStore(subscribeToShellVersion, desktopShellVersion, serverShellVersion)
  const [required, setRequired] = useState(minimum)
  const compatible = version === null || shellSupportsWeb(version, required)

  if (!compatible) return <DesktopUpdateRequired />
  return <>
    {children}
    {monitor && version !== null && <DesktopReleaseMonitor version={version} requireUpgrade={setRequired} />}
  </>
}

function DesktopReleaseMonitor({ version, requireUpgrade }: Readonly<{ version: string; requireUpgrade: (minimum: string) => void }>) {
  const accountId = useHeldAccountId()
  useEffect(() => {
    if (!accountId) return
    try {
      const checkpoint = takeDesktopChatCheckpoint(accountId)
      if (checkpoint) {
        useChatStore.setState({ ...checkpoint.chat, draftHydrated: true, isTyping: false, streamingMessageId: null })
        useUIStore.getState().setAstraConversationOpen(checkpoint.conversationOpen)
      }
    } catch (error) { captureException(error) }
    return watchDesktopWebRelease(version, process.env.NEXT_PUBLIC_WEB_COMMIT_SHA ?? null, requireUpgrade)
  }, [accountId, requireUpgrade, version])
  return null
}

function DesktopUpdateRequired() {
  const t = useTranslations()
  return <main className="flex min-h-dvh items-center justify-center bg-[var(--bg)] text-[var(--fg-1)]">
    <ErrorState message={t('desktopUpdate.required')} />
  </main>
}
