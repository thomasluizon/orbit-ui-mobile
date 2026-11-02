import { useEffect, useState } from 'react'
import { createUseConversationHistory } from '@orbit/shared/chat'
import { conversationHistory } from '@/lib/conversation-history'
import { getAccountGeneration } from '@/lib/session-epoch'

export const useConversationHistory = createUseConversationHistory({ useEffect, useState, history: conversationHistory, getAccountGeneration })
