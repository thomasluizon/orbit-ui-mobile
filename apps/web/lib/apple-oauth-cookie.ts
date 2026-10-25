import { z } from 'zod'

export const APPLE_OAUTH_COOKIE = 'orbit_apple_oauth'
export const appleOAuthAttemptSchema = z.object({
  state: z.string().min(16),
  sessionOwner: z.string(),
})
