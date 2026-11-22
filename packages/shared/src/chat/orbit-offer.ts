import type { OrbitNextAction } from '../types/orbit-offer'
import type { ChatClientContext } from '../types/chat'
import type { BlockAnswerInteraction } from './block-answer'
import type { StateHook } from '../hooks/state-adapter'
import type { SendOneSmallStepMessage } from './one-small-step-actions'

const offerDestinations: Readonly<Record<string, string>> = {
  today: '/', goals: '/progress/goals', progress: '/progress',
  'advanced-api': '/profile/ai', notifications: '/notifications', referrals: 'referrals',
  'profile-preferences': '/profile/preferences', 'calendar-overview': '/calendar',
  'calendar-sync': '/calendar?import=1', 'ai-settings': '/profile/ai',
}

export function orbitOfferDestination(action: OrbitNextAction): string | undefined {
  return action.kind === 'openSurface' && action.surface && Object.hasOwn(offerDestinations, action.surface) ? offerDestinations[action.surface] : undefined
}

export interface OrbitOfferProps {
  action: OrbitNextAction | null | undefined
  onSendMessage?: SendOneSmallStepMessage
  interaction?: BlockAnswerInteraction
  unavailable?: boolean
}

interface OfferSession {
  conversationId: string | null
  dismissedOfferKeys: string[]
}

export function canShowOrbitOffer(action: OrbitOfferProps['action'], context: Pick<ChatClientContext, 'conversationId' | 'supportsProactiveOffers'>, dismissed: readonly string[]): action is OrbitNextAction {
  return Boolean(context.supportsProactiveOffers && context.conversationId && action
    && !dismissed.includes(action.offerKey)
    && (action.kind === 'openSurface' ? orbitOfferDestination(action) : action.prompt))
}

export interface OrbitOfferState {
  visible: boolean; pending: boolean; failed: boolean; disabled: boolean; dismissDisabled: boolean; reason: string | undefined
  act: () => Promise<void>; dismiss: () => Promise<void>
}

export function createUseOrbitOffer(adapters: {
  useState: StateHook
  getSession: () => OfferSession
  rememberDismissal: (key: string) => void
  getAccountGeneration: () => number
  dismiss: (conversationId: string, offerKeys: string[], isCurrent: () => boolean) => Promise<void>
}): (props: OrbitOfferProps, enabled: boolean, navigate: (route: string) => void) => OrbitOfferState {
  return function useOrbitOffer(props: OrbitOfferProps, enabled: boolean, navigate: (route: string) => void) {
    const { action, interaction, onSendMessage } = props
    const [lock] = adapters.useState(() => ({ pending: false }))
    const [pending, setPending] = adapters.useState(false)
    const [failed, setFailed] = adapters.useState(false)
    const session = adapters.getSession()
    const visible = canShowOrbitOffer(action, { conversationId: session.conversationId, supportsProactiveOffers: enabled }, session.dismissedOfferKeys)
    const reason = interaction?.isOnline === false ? 'chat.offline.title'
      : interaction?.isSending || props.unavailable ? 'blockFrame.status.acting'
      : action?.kind !== 'openSurface' && interaction?.dailyBudgetReached ? 'chat.dailyBudgetReached'
      : action?.kind !== 'openSurface' && interaction?.atMessageLimit ? 'shell.composer.limit.exhausted' : undefined
    const dismissDisabled = pending || interaction?.isOnline === false
    const disabled = pending || Boolean(reason) || (action?.kind !== 'openSurface' && !onSendMessage)
    async function run(dismissOnly: boolean) {
      if (!visible || !session.conversationId || lock.pending || (dismissOnly ? dismissDisabled : disabled)) return
      lock.pending = true
      setPending(true)
      setFailed(false)
      const generation = adapters.getAccountGeneration()
      const isCurrent = () => generation === adapters.getAccountGeneration()
        && adapters.getSession().conversationId === session.conversationId
      try {
        const route = orbitOfferDestination(action)
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
    return { visible, pending, failed, disabled, dismissDisabled, reason, act: () => run(false), dismiss: () => run(true) }
  }
}
