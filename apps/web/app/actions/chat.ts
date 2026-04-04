'use server'

import { getAuthHeaders } from '@/lib/auth-api'
import type { ChatResponse } from '@orbit/shared'

const API_BASE = process.env.API_BASE ?? 'http://localhost:5000'

const CHAT_TIMEOUT_MS = 60_000

export type ChatResult =
  | { ok: true; data: ChatResponse }
  | { ok: false; error: string; status: number }

/**
 * Send a chat message to the AI assistant.
 * Accepts FormData with fields: message, image (File), history (JSON string).
 * Forwarded as multipart/form-data to the backend.
 *
 * Returns a discriminated union so the caller can inspect the HTTP status
 * (Server Actions cannot propagate custom Error subclasses to the client).
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
      return { ok: false, error: 'Request timed out', status: 408 }
    }
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: message, status: 500 }
  } finally {
    clearTimeout(timeoutId)
  }
}
