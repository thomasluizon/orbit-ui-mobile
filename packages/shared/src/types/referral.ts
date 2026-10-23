import { z } from 'zod'

export const referralCodeSchema = z.object({
  code: z.string(),
  link: z.string(),
})

export type ReferralCode = z.infer<typeof referralCodeSchema>

export const referralStatsSchema = z.object({
  referralCode: z.string().nullable(),
  referralLink: z.string().nullable(),
  successfulReferrals: z.number(),
  pendingReferrals: z.number(),
  maxReferrals: z.number(),
  rewardType: z.string(),
  discountPercent: z.number(),
  proDaysPerReferral: z.number().optional(),
})

export type ReferralStats = z.infer<typeof referralStatsSchema>

export const referralDashboardSchema = z.object({
  code: z.string(),
  link: z.string(),
  stats: referralStatsSchema,
})

export type ReferralDashboard = z.infer<typeof referralDashboardSchema>

export const referralDashboardPresentationSchema = referralDashboardSchema.extend({
  stats: referralStatsSchema.extend({
    rewardType: referralStatsSchema.shape.rewardType.optional().catch(undefined),
    discountPercent: referralStatsSchema.shape.discountPercent.optional().catch(undefined),
    proDaysPerReferral: referralStatsSchema.shape.proDaysPerReferral.catch(undefined),
  }),
})

export type ReferralPresentationDashboard = z.infer<typeof referralDashboardPresentationSchema>
export type ReferralPresentationStats = ReferralPresentationDashboard['stats']
