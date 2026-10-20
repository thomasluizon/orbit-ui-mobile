const ACCOUNT_SIGNAL_CHANNEL = 'orbit-account-signal'

/**
 * Tells the other tabs which account the shared auth cookie now holds, at the moment it
 * changes. The cookie belongs to every tab at once and a tab gets no event when another one
 * replaces it, so before this the only detection was the 60-second `checkSession` poll.
 */
let accountChannel: BroadcastChannel | null = null

/**
 * One channel for the life of the tab, opened on first use. Closing tears the port down
 * before the runtime has moved anything across it, so the post has to outlive the turn that
 * made it.
 */
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

/**
 * Reads a signal out of an arbitrary message. Any other tab on this origin can post here, so an
 * unrecognised payload is dropped rather than read as a sign out, which would tear down a live
 * session on a stray message.
 */
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
