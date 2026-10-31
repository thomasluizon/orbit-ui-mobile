import type { ChatClientContext } from '../types/chat'
import type { BlockAnswerInteraction } from './block-answer'
import type { StateHook } from '../hooks/state-adapter'
import type { OneSmallStepAction } from '../contracts/blocks/one-small-step'

export type SendOneSmallStepMessage = (message: string, context?: Pick<ChatClientContext, 'previousStartingStep' | 'selectedOfferKey'>) => Promise<void>

type ConversationAvailability = Pick<BlockAnswerInteraction, 'isOnline' | 'isSending' | 'atMessageLimit' | 'dailyBudgetReached'>
interface OneSmallStepActions {
  disabled: boolean
  sending: boolean
  submit: (action: OneSmallStepAction) => Promise<void>
}

export function createUseOneSmallStepActions({ useState }: { useState: StateHook }): (onSend: SendOneSmallStepMessage | undefined, availability?: ConversationAvailability) => OneSmallStepActions {
  return function useOneSmallStepActions(onSend: SendOneSmallStepMessage | undefined, availability?: ConversationAvailability) {
    const blocked = Boolean(availability && (!availability.isOnline || availability.isSending || availability.atMessageLimit || availability.dailyBudgetReached))
    const [lock] = useState(() => ({ pending: false }))
    const [sending, setSending] = useState(false)
    return {
      disabled: blocked || sending || !onSend,
      sending,
      submit: async (action: OneSmallStepAction): Promise<void> => {
        if (blocked || lock.pending || !onSend) return
        lock.pending = true
        setSending(true)
        try {
          if (action.id === 'smaller' && action.previousStep) {
            await onSend(action.message, { previousStartingStep: action.previousStep })
          } else {
            await onSend(action.message)
          }
        } finally {
          lock.pending = false
          setSending(false)
        }
      },
    }
  }
}
