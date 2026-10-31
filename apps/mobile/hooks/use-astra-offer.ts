import { useState } from 'react'
import { createUseAstraOffer, type AstraOfferProps } from '@orbit/shared/chat'
import { API } from '@orbit/shared/api'
import { dismissConversationOffersRequestSchema } from '@orbit/shared/types/astra-offer'
import { useChatStore } from '@/stores/chat-store'
import { getAccountGeneration } from '@/lib/session-epoch'
import { apiClient } from '@/lib/api-client'
import { useChatNavigation } from '@/hooks/use-chat-navigation'

const useOffer = createUseAstraOffer({
  useState, getSession: useChatStore.getState, getAccountGeneration,
  rememberDismissal: key => useChatStore.getState().dismissOffer(key),
  dismiss: async (conversationId, offerKeys, isCurrent) => {
    const request = dismissConversationOffersRequestSchema.parse({ conversationId, offerKeys })
    await apiClient(API.chat.dismissOffers, { method: 'POST', body: JSON.stringify(request), isCurrent, silent: true })
  },
})

export function useAstraOffer(props: AstraOfferProps) {
  const conversationId = useChatStore(state => state.conversationId)
  useChatStore(state => state.dismissedOfferKeys)
  const navigate = useChatNavigation()
  const [referralsOpen, setReferralsOpen] = useState(false)
  const offer = useOffer(props, Boolean(conversationId), destination => {
    if (destination === 'referrals') setReferralsOpen(true)
    else navigate(destination)
  })
  return { ...offer, referralsOpen, closeReferrals: () => setReferralsOpen(false) }
}
