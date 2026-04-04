'use server'

import { getAuthHeaders } from '@/lib/auth-api'
import type { ChatResponse } from '@orbit/shared'

const API_BASE = process.env.API_BASE ?? 'http://localhost:5000'

/**
 * Send a chat message to the AI assistant.
 * Accepts FormData with fields: message, image (File), history (JSON string).
 * Forwarded as multipart/form-data to the backend.
 */
export async function sendChatMessage(formData: FormData): Promise<ChatResponse> {
  const headers = await getAuthHeaders()

  // Do NOT set Content-Type -- fetch will set the multipart boundary automatically
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers,
    body: formData,
  })

  if (!res.ok) {
    const error = await res.json().catch(() => null)
    throw new Error(error?.error ?? error?.message ?? `Failed with status ${res.status}`)
  }

  return res.json()
}
