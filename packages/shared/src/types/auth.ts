import { z } from 'zod'

export const userSchema = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
})

export type User = z.infer<typeof userSchema>

export const loginResponseSchema = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  wasReactivated: z.boolean().optional(),
})

export type LoginResponse = z.infer<typeof loginResponseSchema>

export const backendLoginResponseSchema = loginResponseSchema.extend({
  token: z.string(),
  refreshToken: z.string().nullable(),
})

export type BackendLoginResponse = z.infer<typeof backendLoginResponseSchema>

export const refreshResponseSchema = z.object({
  token: z.string(),
  refreshToken: z.string(),
})

export type RefreshResponse = z.infer<typeof refreshResponseSchema>

export const sendCodeRequestSchema = z.object({
  email: z.string(),
  language: z.string(),
  turnstileToken: z.string().optional(),
})

export type SendCodeRequest = z.infer<typeof sendCodeRequestSchema>

export const verifyCodeRequestSchema = z.object({
  email: z.string(),
  code: z.string(),
  language: z.string(),
  referralCode: z.string().optional(),
  turnstileToken: z.string().optional(),
})

export type VerifyCodeRequest = z.infer<typeof verifyCodeRequestSchema>

export const googleAuthRequestSchema = z.object({
  accessToken: z.string(),
  language: z.string(),
  googleAccessToken: z.string().optional(),
  googleRefreshToken: z.string().optional(),
  referralCode: z.string().optional(),
})

export type GoogleAuthRequest = z.infer<typeof googleAuthRequestSchema>

export const googleCodeAuthRequestSchema = z.object({
  code: z.string(),
  codeVerifier: z.string(),
  redirectUri: z.string(),
  language: z.string().optional(),
  referralCode: z.string().nullable().optional(),
})

export type GoogleCodeAuthRequest = z.infer<typeof googleCodeAuthRequestSchema>

export const googleCodeAuthResponseSchema = backendLoginResponseSchema.extend({
  wasReactivated: z.boolean(),
})
export type GoogleCodeAuthResponse = z.infer<typeof googleCodeAuthResponseSchema>

export const appleStartRequestSchema = z.object({
  state: z.string().min(16),
  language: z.string(),
  referralCode: z.string().optional(),
})

export const appleStartResponseSchema = z.object({
  authorizationUrl: z.url(),
})

export const appleHandoffRequestSchema = z.object({
  handoff: z.string().min(1),
  state: z.string().min(16),
})

export const appleNativeRequestSchema = z.object({
  identityToken: z.string().min(1),
  authorizationCode: z.string().min(1),
  rawNonce: z.string().min(1),
  givenName: z.string().optional(),
  familyName: z.string().optional(),
  language: z.string(),
  referralCode: z.string().optional(),
})
