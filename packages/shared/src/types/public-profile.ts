import { z } from 'zod'

export const updatePublicProfileRequestSchema = z.object({
  enabled: z.boolean(),
  showStreak: z.boolean(),
  showLevel: z.boolean(),
  showAchievements: z.boolean(),
  showTopHabits: z.boolean(),
  regenerate: z.boolean(),
})

export type UpdatePublicProfileRequest = z.infer<typeof updatePublicProfileRequestSchema>

export const publicProfileSettingsSchema = z.object({
  enabled: z.boolean(),
  slug: z.string().nullable(),
  shareUrl: z.string().nullable(),
  showStreak: z.boolean(),
  showLevel: z.boolean(),
  showAchievements: z.boolean(),
  showTopHabits: z.boolean(),
})

export type PublicProfileSettings = z.infer<typeof publicProfileSettingsSchema>

export const publicAchievementSchema = z.object({
  name: z.string(),
  iconKey: z.string(),
  rarity: z.string(),
})

export type PublicAchievement = z.infer<typeof publicAchievementSchema>

export const publicProfileViewSchema = z.object({
  displayName: z.string(),
  handle: z.string().nullable(),
  language: z.string().nullable(),
  currentStreak: z.number().nullable(),
  longestStreak: z.number().nullable(),
  level: z.number().nullable(),
  levelTitle: z.string().nullable(),
  achievements: z.array(publicAchievementSchema).nullable(),
  topHabits: z.array(z.string()).nullable(),
})

export type PublicProfileView = z.infer<typeof publicProfileViewSchema>
