import type { NormalizedHabit, RescheduleSuggestion } from '../types/habit'
import type { Goal } from '../types/goal'
import type { Profile } from '../types/profile'
import type { NotificationItem } from '../types/notification'
import type { Achievement, GamificationProfile, Recap } from '../types/gamification'
import type { AppConfig } from '../types/config'
import { DEFAULT_CONFIG } from '../types/config'
import type { FriendSummary, Cheer, FriendFeedItem } from '../types/social'
import type { ChallengeDetail } from '../types/challenge'
import type { RetrospectiveMetrics } from '../utils/retrospective'


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


export function createMockRescheduleSuggestion(
  overrides: Partial<RescheduleSuggestion> = {},
): RescheduleSuggestion {
  return {
    frequencyUnit: 'Day',
    frequencyQuantity: 1,
    dueDate: '2025-01-02',
    dueTime: null,
    days: [],
    rationale: 'Restart tomorrow with a lighter rhythm so it feels easy to pick back up.',
    ...overrides,
  }
}


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


export function createMockProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    name: 'Thomas',
    email: 'thomas@example.com',
    timeZone: 'America/Sao_Paulo',
    aiMemoryEnabled: true,
    aiSummaryEnabled: true,
    hasCompletedOnboarding: true,
    hasCompletedTour: false,
    language: 'en',
    plan: 'free',
    hasProAccess: false,
    isTrialActive: false,
    trialEndsAt: null,
    planExpiresAt: null,
    aiMessagesUsed: 0,
    aiMessagesLimit: 20,
    hasImportedCalendar: false,
    hasGoogleConnection: false,
    subscriptionInterval: null,
    subscriptionSource: null,
    isLifetimePro: false,
    weekStartDay: 0,
    totalXp: 0,
    level: 1,
    levelTitle: 'Beginner',
    adRewardsClaimedToday: 0,
    currentStreak: 0,
    longestStreak: 0,
    streakFreezesAvailable: 0,
    themePreference: null,
    colorScheme: null,
    googleCalendarAutoSyncEnabled: false,
    googleCalendarAutoSyncStatus: 'Idle',
    googleCalendarLastSyncedAt: null,
    canViewGamification: false,
    hasCreatedFirstHabit: false,
    hasLoggedFirstHabit: false,
    hasTriedAstra: false,
    hasCompletedOnboardingChecklist: false,
    ...overrides,
  }
}


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
    isPro: true,
    achievementsLocked: false,
    nextReward: {
      nextLevel: 4,
      nextLevelTitle: 'Navigator',
      xpToNextLevel: 300,
      proTeaser: null,
    },
    ...overrides,
  }
}


export function createMockConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    ...DEFAULT_CONFIG,
    ...overrides,
  }
}


export function createMockRetrospectiveMetrics(
  overrides: Partial<RetrospectiveMetrics> = {},
): RetrospectiveMetrics {
  return {
    completionRate: 82,
    totalCompletions: 96,
    totalScheduled: 117,
    activeDays: 6,
    periodDays: 7,
    currentStreak: 12,
    bestStreak: 21,
    badHabitSlips: 1,
    weeklyConsistency: [100, 80, 60, 90, 40, 70, 100],
    topHabits: [
      { name: 'Morning run', emoji: '🏃', completionRate: 95, completedCount: 19, scheduledCount: 20 },
      { name: 'Read', emoji: '📚', completionRate: 88, completedCount: 22, scheduledCount: 25 },
      { name: 'Meditate', emoji: '🧘', completionRate: 80, completedCount: 16, scheduledCount: 20 },
    ],
    needsAttention: [],
    ...overrides,
  }
}


export function createMockRecap(overrides: Partial<Recap> = {}): Recap {
  return {
    period: 'week',
    metrics: createMockRetrospectiveMetrics(),
    shareDeepLink: 'https://app.useorbit.org/r/ABC123?recap=week',
    ...overrides,
  }
}


export function createMockFriendSummary(overrides: Partial<FriendSummary> = {}): FriendSummary {
  return {
    userId: 'user-1',
    handle: 'ada_lovelace',
    displayName: 'Ada Lovelace',
    currentStreak: 7,
    ...overrides,
  }
}


export function createMockCheer(overrides: Partial<Cheer> = {}): Cheer {
  return {
    id: 'cheer-1',
    senderId: 'user-2',
    recipientId: 'user-1',
    habitId: 'habit-1',
    note: 'Keep it up!',
    createdAtUtc: '2026-01-01T00:00:00Z',
    senderHandle: 'grace_h',
    senderDisplayName: 'Grace Hopper',
    ...overrides,
  }
}


export function createMockFriendFeedItem(overrides: Partial<FriendFeedItem> = {}): FriendFeedItem {
  return {
    id: 'feed-1',
    actorUserId: 'user-2',
    actorHandle: 'grace_h',
    actorDisplayName: 'Grace Hopper',
    type: 'StreakMilestone',
    value: 30,
    achievementId: null,
    createdAtUtc: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

export function createMockChallengeDetail(overrides: Partial<ChallengeDetail> = {}): ChallengeDetail {
  return {
    id: 'challenge-1',
    creatorId: 'user-1',
    type: 'CoopGoal',
    title: 'March Together',
    description: null,
    status: 'Active',
    targetCount: 30,
    currentProgress: 12,
    isComplete: false,
    periodStartUtc: '2026-03-01',
    periodEndUtc: '2026-03-31',
    joinCode: 'ABC23456',
    completedAtUtc: null,
    createdAtUtc: '2026-03-01T00:00:00Z',
    participants: [{ userId: 'user-1', name: 'Creator', joinedAtUtc: '2026-03-01T00:00:00Z' }],
    yourLinkedHabitIds: ['habit-1'],
    ...overrides,
  }
}
