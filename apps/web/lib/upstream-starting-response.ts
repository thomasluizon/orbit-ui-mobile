import { apiErrorSchema } from '@orbit/shared/types/api'

export async function normalizeUpstreamResponse(response: Response): Promise<Response> {
  if (response.status !== 429) return response
  const payload: unknown = await response.clone().json().catch(() => null)
  if (apiErrorSchema.safeParse(payload).success) return response

  // WHY: Render refuses to wake a sleeping free API for another Render service: https://github.com/thomasluizon/orbit-tickets/issues/1309
  return Response.json({ error: 'Upstream service is starting', errorCode: 'UPSTREAM_STARTING' }, {
    status: 503,
    headers: { 'Retry-After': '5', 'Cache-Control': 'private, no-store' },
  })
}
