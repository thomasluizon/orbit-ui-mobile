import type { NormalizedHabit } from '../types/habit'
import type { Goal } from '../types/goal'
import type { Profile } from '../types/profile'
import type { NotificationItem } from '../types/notification'
import type { Achievement, GamificationProfile } from '../types/gamification'
import type { AppConfig } from '../types/config'
import { DEFAULT_CONFIG } from '../types/config'

// ---------------------------------------------------------------------------
// Habit factory
// ---------------------------------------------------------------------------

export function createMockHabit(overrides: Partial<NormalizedHabit> = {}): NormalizedHabit {
  return {
    id: 'habit-1',
    title: 'Exercise',
    description: null,
    frequencyUnit: 'Day',
    frequencyQuantity: 1,
    isBadHabit: false,
    isCompleted: false,
    isGeneral: false,
    isFlexible: false,
    days: [],
    dueDate: '2025-01-01',
    dueTime: null,
    dueEndTime: null,
    endDate: null,
    position: null,
    checklistItems: [],
    createdAtUtc: '2025-01-01T00:00:00Z',
    parentId: null,
    scheduledDates: ['2025-01-01'],
    isOverdue: false,
    reminderEnabled: false,
    reminderTimes: [],
    scheduledReminders: [],
    slipAlertEnabled: false,
    tags: [],
    hasSubHabits: false,
    flexibleTarget: null,
    flexibleCompleted: null,
    isLoggedInRange: false,
    instances: [],
    searchMatches: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Goal factory
// ---------------------------------------------------------------------------

export function createMockGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'goal-1',
    title: 'Read 12 Books',
    description: null,
    targetValue: 12,
    currentValue: 3,
    unit: 'books',
    status: 'Active',
    deadline: null,
    position: 0,
    createdAtUtc: '2025-01-01T00:00:00Z',
    completedAtUtc: null,
    progressPercentage: 25,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Profile factory
// ---------------------------------------------------------------------------

export function createMockProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    name: 'Thomas',
    email: 'thomas@example.com',
    timeZone: 'America/Sao_Paulo',
    aiMemoryEnabled: true,
    aiSummaryEnabled: true,
    hasCompletedOnboarding: true,
    language: 'en',
    plan: 'free',
    hasProAccess: false,
    isTrialActive: false,
    trialEndsAt: null,
    planExpiresAt: null,
    aiMessagesUsed: 0,
    aiMessagesLimit: 15,
    hasImportedCalendar: false,
    hasGoogleConnection: false,
    subscriptionInterval: null,
    isLifetimePro: false,
    weekStartDay: 0,
    totalXp: 0,
    level: 1,
    levelTitle: 'Beginner',
    adRewardsClaimedToday: 0,
    currentStreak: 0,
    streakFreezesAvailable: 0,
    themePreference: null,
    colorScheme: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Notification factory
// ---------------------------------------------------------------------------

export function createMockNotification(overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id: 'notif-1',
    title: 'Reminder',
    body: 'Time to complete your habit!',
    url: null,
    habitId: null,
    isRead: false,
    createdAtUtc: '2025-01-01T12:00:00Z',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Achievement factory
// ---------------------------------------------------------------------------

export function createMockAchievement(overrides: Partial<Achievement> = {}): Achievement {
  return {
    id: 'achievement-1',
    name: 'First Steps',
    description: 'Complete your first habit',
    category: 'GettingStarted',
    rarity: 'Common',
    xpReward: 50,
    iconKey: 'trophy',
    isEarned: false,
    earnedAtUtc: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// GamificationProfile factory
// ---------------------------------------------------------------------------

export function createMockGamificationProfile(
  overrides: Partial<GamificationProfile> = {},
): GamificationProfile {
  return {
    totalXp: 500,
    level: 3,
    levelTitle: 'Habit Builder',
    xpForCurrentLevel: 400,
    xpForNextLevel: 800,
    xpToNextLevel: 300,
    achievementsEarned: 2,
    achievementsTotal: 20,
    achievements: [
      createMockAchievement({ id: 'a-1', isEarned: true, earnedAtUtc: '2025-01-05T00:00:00Z' }),
      createMockAchievement({ id: 'a-2', name: 'Streak Master', isEarned: true }),
    ],
    userAchievements: [
      { achievementId: 'a-1', earnedAtUtc: '2025-01-05T00:00:00Z' },
      { achievementId: 'a-2', earnedAtUtc: '2025-01-10T00:00:00Z' },
    ],
    currentStreak: 7,
    longestStreak: 14,
    lastActiveDate: '2025-01-15',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// AppConfig factory
// ---------------------------------------------------------------------------

export function createMockConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    ...DEFAULT_CONFIG,
    ...overrides,
  }
}
