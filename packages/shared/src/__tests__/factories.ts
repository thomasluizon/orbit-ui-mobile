import type { NormalizedHabit, RescheduleSuggestion } from '../types/habit'
import type { Goal } from '../types/goal'
import type { Profile } from '../types/profile'
import type { NotificationItem } from '../types/notification'
import type { Achievement, GamificationProfile, Recap } from '../types/gamification'
import type { AppConfig } from '../types/config'
import { DEFAULT_CONFIG } from '../types/config'
import type {
  FriendSummary,
  FriendRequestSummary,
  Cheer,
  FriendFeedItem,
} from '../types/social'
import type { ChallengeDetail, ChallengeListItem } from '../types/challenge'
import type { SyncChangesV2Response } from '../types/sync'
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
    linkedHabits: [],
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
    proactiveAstraEnabled: false,
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
    hasSeenImportPrompt: false,
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


export function createMockFriendRequestSummary(
  overrides: Partial<FriendRequestSummary> = {},
): FriendRequestSummary {
  return {
    id: 'friendship-1',
    userId: 'user-3',
    handle: 'katherine_j',
    displayName: 'Katherine Johnson',
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


export function createMockChallengeListItem(overrides: Partial<ChallengeListItem> = {}): ChallengeListItem {
  return {
    id: 'challenge-1',
    type: 'CoopGoal',
    title: 'March Together',
    status: 'Active',
    targetCount: 30,
    currentProgress: 5,
    isComplete: false,
    participantCount: 2,
    periodStartUtc: '2026-03-01',
    periodEndUtc: '2026-03-31',
    joinCode: 'ABC23456',
    hasLinkedHabits: true,
    ...overrides,
  }
}


const RUN_HABIT_ID = '11111111-1111-4111-8111-111111111111'
const READING_GOAL_ID = '33333333-3333-4333-8333-333333333333'

/**
 * A fully populated GET /api/sync/v2/changes payload whose fields mirror the
 * orbit-api SyncChangesV2Response record (SyncController.cs): DateOnly fields as
 * `YYYY-MM-DD`, TimeOnly fields as `HH:mm:ss`, reminder offsets as minute ints,
 * enum fields as their PascalCase names. Every entity set carries at least one
 * updated row so downstream tests exercise realistic nested shapes.
 */
export function createMockSyncChangesV2Response(
  overrides: Partial<SyncChangesV2Response> = {},
): SyncChangesV2Response {
  return {
    habits: {
      updated: [
        {
          id: RUN_HABIT_ID,
          title: 'Morning run',
          description: 'Easy 5km around the park',
          emoji: '🏃',
          frequencyUnit: 'Week',
          frequencyQuantity: 3,
          isBadHabit: false,
          isCompleted: false,
          dueDate: '2026-01-15',
          dueTime: '07:00:00',
          dueEndTime: '07:45:00',
          reminderEnabled: true,
          reminderTimes: [390, 420],
          isGeneral: false,
          isFlexible: false,
          slipAlertEnabled: false,
          checklistItems: [
            { text: 'Stretch', isChecked: false },
            { text: 'Fill water bottle', isChecked: true },
          ],
          scheduledReminders: [{ when: 'same_day', time: '06:30:00' }],
          endDate: null,
          position: 0,
          parentHabitId: null,
          createdAtUtc: '2026-01-01T08:00:00Z',
          updatedAtUtc: '2026-01-14T09:30:00Z',
        },
      ],
      deleted: [{ id: '1d1d1d1d-1d1d-4d1d-8d1d-1d1d1d1d1d1d', deletedAtUtc: '2026-01-13T10:00:00Z' }],
    },
    habitLogs: {
      updated: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          habitId: RUN_HABIT_ID,
          date: '2026-01-14',
          value: 1,
          createdAtUtc: '2026-01-14T07:50:00Z',
          updatedAtUtc: '2026-01-14T07:50:00Z',
        },
      ],
      deleted: [],
    },
    goals: {
      updated: [
        {
          id: READING_GOAL_ID,
          title: 'Read 12 books',
          description: null,
          targetValue: 12,
          currentValue: 3,
          unit: 'books',
          status: 'Active',
          type: 'Standard',
          deadline: '2026-12-31',
          position: 0,
          createdAtUtc: '2026-01-01T08:00:00Z',
          updatedAtUtc: '2026-01-10T12:00:00Z',
          completedAtUtc: null,
          streakSyncedAtUtc: null,
        },
      ],
      deleted: [],
    },
    goalProgressLogs: {
      updated: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          goalId: READING_GOAL_ID,
          value: 3,
          previousValue: 2,
          note: 'Finished a novel',
          createdAtUtc: '2026-01-10T12:00:00Z',
          updatedAtUtc: '2026-01-10T12:00:00Z',
        },
      ],
      deleted: [],
    },
    tags: {
      updated: [
        {
          id: '55555555-5555-4555-8555-555555555555',
          name: 'Health',
          color: '#22c55e',
          createdAtUtc: '2026-01-01T08:00:00Z',
          updatedAtUtc: '2026-01-01T08:00:00Z',
        },
      ],
      deleted: [],
    },
    notifications: {
      updated: [
        {
          id: '66666666-6666-4666-8666-666666666666',
          title: 'Streak milestone',
          body: 'You hit a 7-day streak!',
          url: '/gamification',
          habitId: RUN_HABIT_ID,
          isRead: false,
          createdAtUtc: '2026-01-14T08:00:00Z',
          updatedAtUtc: '2026-01-14T08:00:00Z',
        },
      ],
      deleted: [],
    },
    checklistTemplates: {
      updated: [
        {
          id: '77777777-7777-4777-8777-777777777777',
          name: 'Gym bag',
          items: ['Shoes', 'Towel', 'Water'],
          createdAtUtc: '2026-01-01T08:00:00Z',
          updatedAtUtc: '2026-01-01T08:00:00Z',
        },
      ],
      deleted: [],
    },
    serverTimestamp: '2026-01-15T10:00:00Z',
    version: 2,
    ...overrides,
  }
}
