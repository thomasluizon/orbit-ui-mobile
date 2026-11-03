'use client'

import type { ComposerAttempt } from '@orbit/shared/hooks';


export type UseChatComposerOptions = { pathname?: string; selectedDate?: string; today?: string; totalHabitCount?: number | null; includeGeneral?: boolean }

export type AttemptedSend = ComposerAttempt<File, FormData> & { intendedAccountId: string | null }

export interface StreamSendFailure {
  status: number | null
  error: string
  code: string | null
}
