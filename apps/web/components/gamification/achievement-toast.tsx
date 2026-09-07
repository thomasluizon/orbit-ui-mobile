'use client'

import { useEffect } from 'react'
import { useGamificationProfile } from '@/hooks/use-gamification'

export function AchievementToast() {
  const { newAchievements, invalidate } = useGamificationProfile()

  useEffect(() => {
    if (newAchievements.length === 0) return
    invalidate()
  }, [invalidate, newAchievements])

  return null
}
