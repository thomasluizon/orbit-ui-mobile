import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createUseProactiveAction } from '@orbit/shared/hooks'
import { useProfile } from '@/hooks/use-profile'
import { useChatStore } from '@/stores/chat-store'
import { getSessionEpoch } from '@/lib/session-epoch'
import { API } from '@orbit/shared/api'
import { proactiveItemStatusSchema, type ProactiveItemStatus } from '@orbit/shared/types'
import { apiClient } from '@/lib/api-client'

export const useProactiveAction = createUseProactiveAction({
  useEffect, useRef, useMutation, useQuery, useQueryClient, useProfile, useChatStore, getSessionEpoch,
  requestStatus: (id, signal) => apiClient<ProactiveItemStatus>(API.proactive.status(id), { signal }, proactiveItemStatusSchema),
  reportActed: (id) => apiClient(API.proactive.acted(id), { method: 'POST', silent: true, skipAuthRecovery: true }),
})
