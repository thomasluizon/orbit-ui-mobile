'use client'

import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createUseProactiveAction } from '@orbit/shared/hooks'
import { useProfile } from '@/hooks/use-profile'
import { useChatStore } from '@/stores/chat-store'
import { getSessionEpoch } from '@/lib/session-epoch'
import { getProactiveItemStatus, reportProactiveActed } from '@/app/actions/chat'
import { getHeldAccountId } from '@/stores/auth-store'

export const useProactiveAction = createUseProactiveAction({
  useEffect, useRef, useMutation, useQuery, useQueryClient, useProfile, useChatStore, getSessionEpoch,
  requestStatus: getProactiveItemStatus,
  reportActed: (id) => reportProactiveActed(id, getHeldAccountId()),
})
