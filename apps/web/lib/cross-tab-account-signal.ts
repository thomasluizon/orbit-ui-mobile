const ACCOUNT_SIGNAL_CHANNEL = 'orbit-account-signal'

let accountChannel: BroadcastChannel | null = null

function openAccountChannel(): BroadcastChannel | null {
  if (accountChannel) return accountChannel
  if (typeof BroadcastChannel === 'undefined') return null

  try {
    accountChannel = new BroadcastChannel(ACCOUNT_SIGNAL_CHANNEL)
  } catch {
    accountChannel = null
  }
  return accountChannel
}

/** The account the cookie now holds, where `null` says it holds none. */
export interface AccountSignal {
  accountId: string | null
}

function readAccountSignal(payload: unknown): AccountSignal | null {
  if (typeof payload !== 'object' || payload === null) return null
  const { accountId } = payload as { accountId?: unknown }
  if (accountId === null) return { accountId: null }
  if (typeof accountId !== 'string' || accountId.length === 0) return null
  return { accountId }
}

/**
 * Announces the account a session just started under, or `null` for a sign out. Both
 * transitions travel, because a tab left believing a dead account is still live keeps that
 * account's habits, goals and alerts on screen for whoever is at the keyboard next.
 */
export function announceAccountToOtherTabs(accountId: string | null): void {
  openAccountChannel()?.postMessage({ accountId } satisfies AccountSignal)
}

/**
 * Registers a listener for another tab's account and returns its removal. The teardown drops the
 * listener and leaves the channel open, because the tab still announces its own transitions through
 * it after the shell that was listening unmounts.
 */
export function subscribeToAccountSignal(
  onAccountAnnounced: (accountId: string | null) => void,
): () => void {
  const channel = openAccountChannel()
  if (!channel) return () => {}

  const handleAccountMessage = (event: MessageEvent) => {
    const signal = readAccountSignal(event.data)
    if (signal) onAccountAnnounced(signal.accountId)
  }

  channel.addEventListener('message', handleAccountMessage)
  return () => {
    channel.removeEventListener('message', handleAccountMessage)
  }
}

/** Closes the tab's channel so the next test opens its own. */
export function resetAccountSignalForTests(): void {
  accountChannel?.close()
  accountChannel = null
}
