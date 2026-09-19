const ACCOUNT_SIGNAL_CHANNEL = 'orbit-account-signal'

/**
 * Tells the other tabs which account the shared auth cookie now holds, at the moment it changes.
 *
 * The cookie belongs to every tab at once and a tab gets no event when another one replaces it, so
 * before this the only detection was the 60-second `checkSession` poll. A poll samples; it cannot
 * close the window, only shrink it, and every shortening costs one request per tab per interval.
 *
 * `BroadcastChannel` carries the signal rather than a `storage` event, for three reasons. It says
 * what it is, where a `storage` listener has to filter every unrelated key the app writes. It
 * carries a structured payload instead of a string the receiver parses back. And it needs no
 * durable write, where the `storage` route has to leave the account id in `localStorage` and then
 * remove it, which is both a same-origin record of who signed in and a second event to ignore.
 *
 * Where `BroadcastChannel` is missing the signal simply never arrives and the 60-second poll stays
 * the detector, which is the behaviour every tab has today. Nothing depends on delivery.
 *
 * Mobile gets no equivalent, and the parity exemption is the cookie against SecureStore adapter.
 * One app has one runtime and no second tab to replace the account under it, and every request
 * reads the token out of SecureStore and sends it as an explicit Bearer, so the credential is bound
 * when the request is built rather than picked up by the platform when it is sent.
 */
function openAccountChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null
  try {
    return new BroadcastChannel(ACCOUNT_SIGNAL_CHANNEL)
  } catch {
    return null
  }
}

function readAccountId(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null
  const { accountId } = payload as { accountId?: unknown }
  return typeof accountId === 'string' && accountId.length > 0 ? accountId : null
}

/**
 * Announces the account a session just started under. The posting channel never receives its own
 * message, and a listener open in this same tab that does receive it reads an account it already
 * holds, so the sending tab does nothing either way.
 */
export function announceAccountToOtherTabs(accountId: string): void {
  const channel = openAccountChannel()
  if (!channel) return

  channel.postMessage({ accountId })
  channel.close()
}

/** Registers a listener for another tab's account and returns its removal. */
export function subscribeToAccountSignal(
  onAccountAnnounced: (accountId: string) => void,
): () => void {
  const channel = openAccountChannel()
  if (!channel) return () => {}

  const handleAccountMessage = (event: MessageEvent) => {
    const accountId = readAccountId(event.data)
    if (accountId !== null) onAccountAnnounced(accountId)
  }

  channel.addEventListener('message', handleAccountMessage)
  return () => {
    channel.removeEventListener('message', handleAccountMessage)
    channel.close()
  }
}
