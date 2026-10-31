import type { AstraNextAction } from '../types/astra-offer'
import type { ChatClientContext } from '../types/chat'
import type { BlockAnswerInteraction } from './block-answer'
import type { StateHook } from '../hooks/state-adapter'
import type { SendOneSmallStepMessage } from './one-small-step-actions'

const offerDestinations: Readonly<Record<string, string>> = {
  today: '/', goals: '/progress/goals', progress: '/progress',
  'advanced-api': '/profile/astra', notifications: '/notifications', referrals: 'referrals',
  'profile-preferences': '/profile/preferences', 'calendar-overview': '/calendar',
  'calendar-sync': '/calendar?import=1', 'ai-settings': '/profile/astra',
}

export function astraOfferDestination(action: AstraNextAction): string | undefined {
  return action.kind === 'openSurface' && action.surface && Object.hasOwn(offerDestinations, action.surface) ? offerDestinations[action.surface] : undefined
}

export interface AstraOfferProps {
  action: AstraNextAction | null | undefined
  onSendMessage?: SendOneSmallStepMessage
  interaction?: BlockAnswerInteraction
  unavailable?: boolean
}

interface OfferSession {
  conversationId: string | null
  dismissedOfferKeys: string[]
}

export function canShowAstraOffer(action: AstraOfferProps['action'], context: Pick<ChatClientContext, 'conversationId' | 'supportsProactiveOffers'>, dismissed: readonly string[]): action is AstraNextAction {
  return Boolean(context.supportsProactiveOffers && context.conversationId && action
    && !dismissed.includes(action.offerKey)
    && (action.kind === 'openSurface' ? astraOfferDestination(action) : action.prompt))
}

export interface AstraOfferState {
  visible: boolean; pending: boolean; failed: boolean; disabled: boolean; reason: string | undefined
  act: () => Promise<void>; dismiss: () => Promise<void>
}

export function createUseAstraOffer(adapters: {
  useState: StateHook
  getSession: () => OfferSession
  rememberDismissal: (key: string) => void
  getAccountGeneration: () => number
  dismiss: (conversationId: string, offerKeys: string[], isCurrent: () => boolean) => Promise<void>
}): (props: AstraOfferProps, enabled: boolean, navigate: (route: string) => void) => AstraOfferState {
  return function useAstraOffer(props: AstraOfferProps, enabled: boolean, navigate: (route: string) => void) {
    const { action, interaction, onSendMessage } = props
    const [lock] = adapters.useState(() => ({ pending: false }))
    const [pending, setPending] = adapters.useState(false)
    const [failed, setFailed] = adapters.useState(false)
    const session = adapters.getSession()
    const visible = canShowAstraOffer(action, { conversationId: session.conversationId, supportsProactiveOffers: enabled }, session.dismissedOfferKeys)
    const reason = interaction?.isOnline === false ? 'chat.choice.offline'
      : interaction?.isSending || props.unavailable ? 'blockFrame.status.acting'
      : action?.kind !== 'openSurface' && (interaction?.atMessageLimit || interaction?.dailyBudgetReached) ? 'chat.offers.limit' : undefined
    const disabled = pending || Boolean(reason) || (action?.kind !== 'openSurface' && !onSendMessage)
    async function run(dismissOnly: boolean) {
      if (!visible || !session.conversationId || lock.pending || disabled) return
      lock.pending = true
      setPending(true)
      setFailed(false)
      const generation = adapters.getAccountGeneration()
      const isCurrent = () => generation === adapters.getAccountGeneration()
        && adapters.getSession().conversationId === session.conversationId
      try {
        const route = astraOfferDestination(action)
        if (dismissOnly || route) await adapters.dismiss(session.conversationId, [action.offerKey], isCurrent)
        if (!isCurrent()) return
        if (dismissOnly || route) adapters.rememberDismissal(action.offerKey)
        if (!dismissOnly && route) navigate(route)
        else if (!dismissOnly && action.prompt) await onSendMessage?.(action.prompt, { selectedOfferKey: action.offerKey })
      } catch {
        if (isCurrent()) setFailed(true)
      } finally {
        lock.pending = false
        if (isCurrent()) setPending(false)
      }
    }
    return { visible, pending, failed, disabled, reason, act: () => run(false), dismiss: () => run(true) }
  }
}
