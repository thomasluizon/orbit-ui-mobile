'use client'

import { useState } from 'react'
import { createUseAstraOffer, type AstraOfferProps } from '@orbit/shared/chat'
import { useChatStore } from '@/stores/chat-store'
import { getAccountGeneration } from '@/lib/session-epoch'
import { getHeldAccountId } from '@/stores/auth-store'
import { dismissChatOffers } from '@/app/actions/chat'
import { useChatNavigation } from '@/hooks/use-chat-navigation'

const useOffer = createUseAstraOffer({
  useState, getSession: useChatStore.getState, getAccountGeneration,
  rememberDismissal: key => useChatStore.getState().dismissOffer(key),
  dismiss: async (conversationId, offerKeys) => {
    const result = await dismissChatOffers(conversationId, offerKeys, getHeldAccountId())
    if (!result.ok) throw new Error(result.error)
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
