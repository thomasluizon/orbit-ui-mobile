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
})

export type SendCodeRequest = z.infer<typeof sendCodeRequestSchema>

export const verifyCodeRequestSchema = z.object({
  email: z.string(),
  code: z.string(),
  language: z.string(),
  referralCode: z.string().optional(),
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
