'use server'

import { getAuthHeaders } from '@/lib/auth-api'
import { API } from '@orbit/shared/api'
import type {
  AgentExecuteOperationResponse,
  AgentStepUpChallenge,
  ChatResponse,
  PendingAgentOperationConfirmation,
} from '@orbit/shared'
import { serverAuthFetch } from '@/lib/server-fetch'

const API_BASE = process.env.API_BASE ?? 'http://localhost:5000'

const CHAT_TIMEOUT_MS = 60_000

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number }

export type ChatResult = ActionResult<ChatResponse>
export type PendingOperationActionResult<T> = ActionResult<T>

/**
 * Send a chat message to the AI assistant.
 * Accepts FormData with fields: message, image (File), history (JSON string).
 * Forwarded as multipart/form-data to the backend.
 *
 * Returns a discriminated union so the caller can inspect the HTTP status
 * (Server Actions cannot propagate custom Error subclasses to the client).
 *
 * TODO(task3-p1): Chat `history` is currently client-supplied, so a malicious
 * client can replay or forge prior turns. Migrate to server-persisted
 * conversations keyed by `conversationId` — client sends only the current
 * turn; backend loads recent N messages from a conversations table. Requires
 * coordinated backend migration + schema work (see backend PLAN.md F4 /
 * P0 #5) and is out of scope for this focused PR. Marked as P1 in the audit,
 * tracked via PLAN.md Area B #3.
 */
export async function sendChatMessage(formData: FormData): Promise<ChatResult> {
  const headers = await getAuthHeaders()

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS)

  try {
    // Do NOT set Content-Type -- fetch will set the multipart boundary automatically
    const res = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers,
      body: formData,
      signal: controller.signal,
    })

    if (!res.ok) {
      const body = await res.json().catch(() => null)
      const message = body?.error ?? body?.message ?? `Failed with status ${res.status}`
      return { ok: false, error: message, status: res.status }
    }

    const data: ChatResponse = await res.json()
    return { ok: true, data }
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { ok: false, error: 'CHAT_TIMEOUT', status: 408 }
    }
    const message = err instanceof Error ? err.message : 'CHAT_UNKNOWN_ERROR'
    return { ok: false, error: message, status: 500 }
  } finally {
    clearTimeout(timeoutId)
  }
}

async function wrapServerAction<T>(fn: () => Promise<T>): Promise<PendingOperationActionResult<T>> {
  try {
    const data = await fn()
    return { ok: true, data }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    const status = typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      typeof (error as { status?: unknown }).status === 'number'
      ? ((error as { status: number }).status)
      : 500

    return { ok: false, error: message, status }
  }
}

export async function confirmPendingOperation(
  id: string,
): Promise<PendingOperationActionResult<PendingAgentOperationConfirmation>> {
  return wrapServerAction(() =>
    serverAuthFetch<PendingAgentOperationConfirmation>(API.ai.pendingOperationConfirm(id), {
      method: 'POST',
    }),
  )
}

export async function issuePendingOperationStepUp(
  id: string,
  language: string,
): Promise<PendingOperationActionResult<AgentStepUpChallenge>> {
  return wrapServerAction(() =>
    serverAuthFetch<AgentStepUpChallenge>(API.ai.pendingOperationStepUp(id), {
      method: 'POST',
      body: JSON.stringify({ language }),
    }),
  )
}

export async function verifyPendingOperationStepUp(
  id: string,
  challengeId: string,
  code: string,
): Promise<PendingOperationActionResult<{ id: string } | null>> {
  return wrapServerAction(() =>
    serverAuthFetch<{ id: string } | null>(API.ai.pendingOperationVerifyStepUp(id), {
      method: 'POST',
      body: JSON.stringify({ challengeId, code }),
    }),
  )
}

export async function executePendingOperation(
  id: string,
  confirmationToken: string,
): Promise<PendingOperationActionResult<AgentExecuteOperationResponse>> {
  return wrapServerAction(() =>
    serverAuthFetch<AgentExecuteOperationResponse>(API.ai.pendingOperationExecute(id), {
      method: 'POST',
      body: JSON.stringify({ confirmationToken }),
    }),
  )
}
