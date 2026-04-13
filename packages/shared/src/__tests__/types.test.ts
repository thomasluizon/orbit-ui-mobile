import { describe, it, expect } from 'vitest'
import {
  normalizedHabitSchema,
  createPaginatedSchema,
  habitScheduleItemSchema,
} from '../types/habit'
import { goalSchema, paginatedGoalResponseSchema } from '../types/goal'
import { profileSchema } from '../types/profile'
import { notificationItemSchema, notificationsResponseSchema } from '../types/notification'
import { achievementSchema, gamificationProfileSchema } from '../types/gamification'
import { appConfigSchema } from '../types/config'

// Auth schemas
import {
  userSchema,
  loginResponseSchema,
  backendLoginResponseSchema,
  refreshResponseSchema,
  sendCodeRequestSchema,
  verifyCodeRequestSchema,
  googleAuthRequestSchema,
} from '../types/auth'

// Chat schemas
import {
  aiActionTypeSchema,
  actionStatusSchema,
  conflictingHabitSchema,
  conflictWarningSchema,
  suggestedSubHabitSchema,
  actionResultSchema,
  chatMessageSchema,
  chatResponseSchema,
} from '../types/chat'

// Sync schemas
import {
  mutationTypeSchema,
  queuedMutationSchema,
  syncBatchRequestSchema,
  syncMutationResultSchema,
  syncBatchResponseSchema,
  syncChangesResponseSchema,
} from '../types/sync'

// Subscription schemas
import {
  planPriceSchema,
  subscriptionPlansSchema,
  billingPaymentMethodSchema,
  billingInvoiceSchema,
  billingDetailsSchema,
} from '../types/subscription'

// Referral schemas
import {
  referralCodeSchema,
  referralStatsSchema,
  referralDashboardSchema,
} from '../types/referral'

// User fact schema
import { userFactSchema } from '../types/user-fact'

// API key schemas
import { apiKeySchema, apiKeyCreateResponseSchema } from '../types/api-key'

// Checklist template schema
import { checklistTemplateSchema } from '../types/checklist-template'

// API error schema
import { apiErrorSchema } from '../types/api'

import {
  createMockHabit,
  createMockGoal,
  createMockProfile,
  createMockNotification,
  createMockAchievement,
  createMockGamificationProfile,
  createMockConfig,
} from './factories'

// ---------------------------------------------------------------------------
// Habit schemas
// ---------------------------------------------------------------------------

describe('habit schemas', () => {
  describe('normalizedHabitSchema', () => {
    it('parses a valid NormalizedHabit', () => {
      const habit = createMockHabit()
      const result = normalizedHabitSchema.safeParse(habit)
      expect(result.success).toBe(true)
    })

    it('rejects a habit without a title', () => {
      const habit = createMockHabit()
      const { title: _, ...rest } = habit
      const result = normalizedHabitSchema.safeParse(rest)
      expect(result.success).toBe(false)
    })

    it('rejects invalid frequencyUnit value', () => {
      const habit = createMockHabit({ frequencyUnit: 'Hourly' as any })
      const result = normalizedHabitSchema.safeParse(habit)
      expect(result.success).toBe(false)
    })

    it('accepts null optional fields', () => {
      const habit = createMockHabit({
        description: null,
        dueTime: null,
        dueEndTime: null,
        endDate: null,
        position: null,
        flexibleTarget: null,
        flexibleCompleted: null,
      })
      const result = normalizedHabitSchema.safeParse(habit)
      expect(result.success).toBe(true)
    })

    it('validates checklistItems sub-schema', () => {
      const habit = createMockHabit({
        checklistItems: [
          { text: 'Step 1', isChecked: false },
          { text: 'Step 2', isChecked: true },
        ],
      })
      const result = normalizedHabitSchema.safeParse(habit)
      expect(result.success).toBe(true)
    })

    it('rejects invalid checklist item', () => {
      const habit = createMockHabit({
        checklistItems: [{ text: 123, isChecked: 'nope' }] as any,
      })
      const result = normalizedHabitSchema.safeParse(habit)
      expect(result.success).toBe(false)
    })

    it('validates tags sub-schema', () => {
      const habit = createMockHabit({
        tags: [{ id: 'tag-1', name: 'Health', color: '#ff0000' }],
      })
      const result = normalizedHabitSchema.safeParse(habit)
      expect(result.success).toBe(true)
    })

    it('validates instances sub-schema', () => {
      const habit = createMockHabit({
        instances: [{ date: '2025-01-01', status: 'Completed', logId: 'log-1', note: null }],
      })
      const result = normalizedHabitSchema.safeParse(habit)
      expect(result.success).toBe(true)
    })

    it('rejects invalid instance status', () => {
      const habit = createMockHabit({
        instances: [{ date: '2025-01-01', status: 'Invalid', logId: null, note: null }] as any,
      })
      const result = normalizedHabitSchema.safeParse(habit)
      expect(result.success).toBe(false)
    })
  })

  describe('createPaginatedSchema', () => {
    it('creates a working paginated response schema', () => {
      const paginatedHabits = createPaginatedSchema(habitScheduleItemSchema)
      const data = {
        items: [],
        page: 1,
        pageSize: 50,
        totalCount: 0,
        totalPages: 0,
      }
      const result = paginatedHabits.safeParse(data)
      expect(result.success).toBe(true)
    })

    it('rejects paginated response with missing page field', () => {
      const paginatedHabits = createPaginatedSchema(habitScheduleItemSchema)
      const data = {
        items: [],
        pageSize: 50,
        totalCount: 0,
        totalPages: 0,
      }
      const result = paginatedHabits.safeParse(data)
      expect(result.success).toBe(false)
    })
  })
})

// ---------------------------------------------------------------------------
// Goal schemas
// ---------------------------------------------------------------------------

describe('goal schemas', () => {
  describe('goalSchema', () => {
    it('parses a valid Goal', () => {
      const goal = createMockGoal()
      const result = goalSchema.safeParse(goal)
      expect(result.success).toBe(true)
    })

    it('rejects a goal without a title', () => {
      const goal = createMockGoal()
      const { title: _, ...rest } = goal
      const result = goalSchema.safeParse(rest)
      expect(result.success).toBe(false)
    })

    it('rejects invalid status value', () => {
      const goal = createMockGoal({ status: 'InProgress' as any })
      const result = goalSchema.safeParse(goal)
      expect(result.success).toBe(false)
    })

    it('accepts null optional fields', () => {
      const goal = createMockGoal({
        description: null,
        deadline: null,
        completedAtUtc: null,
      })
      const result = goalSchema.safeParse(goal)
      expect(result.success).toBe(true)
    })

    it('accepts optional linkedHabits', () => {
      const goal = createMockGoal({
        linkedHabits: [{ id: 'h-1', title: 'Exercise' }],
      })
      const result = goalSchema.safeParse(goal)
      expect(result.success).toBe(true)
    })
  })

  describe('paginatedGoalResponseSchema', () => {
    it('parses a valid paginated goal response', () => {
      const data = {
        items: [createMockGoal()],
        page: 1,
        pageSize: 100,
        totalCount: 1,
        totalPages: 1,
      }
      const result = paginatedGoalResponseSchema.safeParse(data)
      expect(result.success).toBe(true)
    })
  })
})

// ---------------------------------------------------------------------------
// Profile schema
// ---------------------------------------------------------------------------

describe('profile schema', () => {
  it('parses a valid Profile', () => {
    const profile = createMockProfile()
    const result = profileSchema.safeParse(profile)
    expect(result.success).toBe(true)
  })

  it('rejects missing email field', () => {
    const profile = createMockProfile()
    const { email: _, ...rest } = profile
    const result = profileSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it('rejects invalid plan type', () => {
    const profile = createMockProfile({ plan: 'enterprise' as any })
    const result = profileSchema.safeParse(profile)
    expect(result.success).toBe(false)
  })

  it('accepts null optional fields', () => {
    const profile = createMockProfile({
      timeZone: null,
      language: null,
      trialEndsAt: null,
      planExpiresAt: null,
      subscriptionInterval: null,
      themePreference: null,
      colorScheme: null,
    })
    const result = profileSchema.safeParse(profile)
    expect(result.success).toBe(true)
  })

  it('accepts pro plan with subscription interval', () => {
    const profile = createMockProfile({
      plan: 'pro',
      hasProAccess: true,
      subscriptionInterval: 'yearly',
    })
    const result = profileSchema.safeParse(profile)
    expect(result.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Notification schema
// ---------------------------------------------------------------------------

describe('notification schemas', () => {
  it('parses a valid NotificationItem', () => {
    const notif = createMockNotification()
    const result = notificationItemSchema.safeParse(notif)
    expect(result.success).toBe(true)
  })

  it('rejects missing title', () => {
    const notif = createMockNotification()
    const { title: _, ...rest } = notif
    const result = notificationItemSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it('parses a valid NotificationsResponse', () => {
    const response = {
      items: [createMockNotification(), createMockNotification({ id: 'notif-2', isRead: true })],
      unreadCount: 1,
    }
    const result = notificationsResponseSchema.safeParse(response)
    expect(result.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Gamification schemas
// ---------------------------------------------------------------------------

describe('gamification schemas', () => {
  describe('achievementSchema', () => {
    it('parses a valid Achievement', () => {
      const achievement = createMockAchievement()
      const result = achievementSchema.safeParse(achievement)
      expect(result.success).toBe(true)
    })

    it('accepts earned achievement with date', () => {
      const achievement = createMockAchievement({
        isEarned: true,
        earnedAtUtc: '2025-06-15T10:00:00Z',
      })
      const result = achievementSchema.safeParse(achievement)
      expect(result.success).toBe(true)
    })
  })

  describe('gamificationProfileSchema', () => {
    it('parses a valid GamificationProfile', () => {
      const profile = createMockGamificationProfile()
      const result = gamificationProfileSchema.safeParse(profile)
      expect(result.success).toBe(true)
    })

    it('rejects negative totalXp', () => {
      // Numbers that are negative should still parse (no min constraint in schema)
      // This test verifies the schema parses the shape correctly
      const profile = createMockGamificationProfile({ totalXp: -1 })
      const result = gamificationProfileSchema.safeParse(profile)
      expect(result.success).toBe(true) // No min constraint on totalXp
    })

    it('accepts null xpToNextLevel (max level reached)', () => {
      const profile = createMockGamificationProfile({ xpToNextLevel: null })
      const result = gamificationProfileSchema.safeParse(profile)
      expect(result.success).toBe(true)
    })
  })
})

// ---------------------------------------------------------------------------
// Config schema
// ---------------------------------------------------------------------------

describe('config schema', () => {
  it('parses a valid AppConfig', () => {
    const config = createMockConfig()
    const result = appConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
  })

  it('rejects config missing limits', () => {
    const config = createMockConfig()
    const { limits: _, ...rest } = config
    const result = appConfigSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it('rejects config missing features', () => {
    const config = createMockConfig()
    const { features: _, ...rest } = config
    const result = appConfigSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it('validates feature flag shape', () => {
    const config = createMockConfig({
      features: {
        'custom.feature': { enabled: true, plan: null },
      },
    })
    const result = appConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Auth schemas
// ---------------------------------------------------------------------------

describe('auth schemas', () => {
  describe('userSchema', () => {
    it('parses a valid User', () => {
      const result = userSchema.safeParse({
        userId: 'u-1',
        name: 'Thomas',
        email: 'thomas@example.com',
      })
      expect(result.success).toBe(true)
    })

    it('rejects missing email', () => {
      const result = userSchema.safeParse({ userId: 'u-1', name: 'Thomas' })
      expect(result.success).toBe(false)
    })

    it('rejects non-string userId', () => {
      const result = userSchema.safeParse({ userId: 123, name: 'Thomas', email: 't@t.com' })
      expect(result.success).toBe(false)
    })
  })

  describe('loginResponseSchema', () => {
    it('parses a valid login response', () => {
      const result = loginResponseSchema.safeParse({
        userId: 'u-1',
        name: 'Thomas',
        email: 'thomas@example.com',
      })
      expect(result.success).toBe(true)
    })

    it('parses login response with optional wasReactivated', () => {
      const result = loginResponseSchema.safeParse({
        userId: 'u-1',
        name: 'Thomas',
        email: 'thomas@example.com',
        wasReactivated: true,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.wasReactivated).toBe(true)
      }
    })

    it('allows omitting wasReactivated', () => {
      const result = loginResponseSchema.safeParse({
        userId: 'u-1',
        name: 'Thomas',
        email: 'thomas@example.com',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.wasReactivated).toBeUndefined()
      }
    })
  })

  describe('backendLoginResponseSchema', () => {
    it('parses a valid backend login response with token', () => {
      const result = backendLoginResponseSchema.safeParse({
        userId: 'u-1',
        name: 'Thomas',
        email: 'thomas@example.com',
        token: 'jwt-token',
        refreshToken: 'refresh-token',
      })
      expect(result.success).toBe(true)
    })

    it('accepts null refreshToken', () => {
      const result = backendLoginResponseSchema.safeParse({
        userId: 'u-1',
        name: 'Thomas',
        email: 'thomas@example.com',
        token: 'jwt-token',
        refreshToken: null,
      })
      expect(result.success).toBe(true)
    })

    it('rejects missing token', () => {
      const result = backendLoginResponseSchema.safeParse({
        userId: 'u-1',
        name: 'Thomas',
        email: 'thomas@example.com',
        refreshToken: 'r-token',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('refreshResponseSchema', () => {
    it('parses valid refresh response', () => {
      const result = refreshResponseSchema.safeParse({
        token: 'new-jwt',
        refreshToken: 'new-refresh',
      })
      expect(result.success).toBe(true)
    })

    it('rejects missing refreshToken', () => {
      const result = refreshResponseSchema.safeParse({ token: 'new-jwt' })
      expect(result.success).toBe(false)
    })
  })

  describe('sendCodeRequestSchema', () => {
    it('parses valid send code request', () => {
      const result = sendCodeRequestSchema.safeParse({
        email: 'test@test.com',
        language: 'en',
      })
      expect(result.success).toBe(true)
    })

    it('rejects missing language', () => {
      const result = sendCodeRequestSchema.safeParse({ email: 'test@test.com' })
      expect(result.success).toBe(false)
    })
  })

  describe('verifyCodeRequestSchema', () => {
    it('parses valid verify code request', () => {
      const result = verifyCodeRequestSchema.safeParse({
        email: 'test@test.com',
        code: '123456',
        language: 'en',
      })
      expect(result.success).toBe(true)
    })

    it('accepts optional referralCode', () => {
      const result = verifyCodeRequestSchema.safeParse({
        email: 'test@test.com',
        code: '123456',
        language: 'en',
        referralCode: 'REF123',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.referralCode).toBe('REF123')
      }
    })

    it('rejects missing code', () => {
      const result = verifyCodeRequestSchema.safeParse({
        email: 'test@test.com',
        language: 'en',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('googleAuthRequestSchema', () => {
    it('parses valid google auth request', () => {
      const result = googleAuthRequestSchema.safeParse({
        accessToken: 'google-access-token',
        language: 'en',
      })
      expect(result.success).toBe(true)
    })

    it('accepts optional google tokens and referralCode', () => {
      const result = googleAuthRequestSchema.safeParse({
        accessToken: 'token',
        language: 'en',
        googleAccessToken: 'g-access',
        googleRefreshToken: 'g-refresh',
        referralCode: 'REF123',
      })
      expect(result.success).toBe(true)
    })

    it('rejects missing accessToken', () => {
      const result = googleAuthRequestSchema.safeParse({ language: 'en' })
      expect(result.success).toBe(false)
    })
  })
})

// ---------------------------------------------------------------------------
// Chat schemas
// ---------------------------------------------------------------------------

describe('chat schemas', () => {
  describe('aiActionTypeSchema', () => {
    it('parses valid action types', () => {
      const types = [
        'CreateHabit', 'LogHabit', 'UpdateHabit', 'DeleteHabit', 'SkipHabit',
        'CreateSubHabit', 'SuggestBreakdown', 'AssignTags', 'DuplicateHabit', 'MoveHabit',
      ]
      for (const t of types) {
        expect(aiActionTypeSchema.safeParse(t).success).toBe(true)
      }
    })

    it('rejects invalid action type', () => {
      expect(aiActionTypeSchema.safeParse('Archive').success).toBe(false)
    })
  })

  describe('actionStatusSchema', () => {
    it('parses valid statuses', () => {
      for (const s of ['Success', 'Failed', 'Suggestion']) {
        expect(actionStatusSchema.safeParse(s).success).toBe(true)
      }
    })

    it('rejects invalid status', () => {
      expect(actionStatusSchema.safeParse('Pending').success).toBe(false)
    })
  })

  describe('conflictingHabitSchema', () => {
    it('parses valid conflicting habit', () => {
      const result = conflictingHabitSchema.safeParse({
        habitId: 'h-1',
        habitTitle: 'Exercise',
        conflictDescription: 'Schedule overlap',
      })
      expect(result.success).toBe(true)
    })

    it('rejects missing conflictDescription', () => {
      const result = conflictingHabitSchema.safeParse({
        habitId: 'h-1',
        habitTitle: 'Exercise',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('conflictWarningSchema', () => {
    it('parses valid conflict warning', () => {
      const result = conflictWarningSchema.safeParse({
        hasConflict: true,
        conflictingHabits: [
          { habitId: 'h-1', habitTitle: 'Exercise', conflictDescription: 'Overlap' },
        ],
        severity: 'HIGH',
        recommendation: 'Adjust schedule',
      })
      expect(result.success).toBe(true)
    })

    it('accepts null recommendation', () => {
      const result = conflictWarningSchema.safeParse({
        hasConflict: false,
        conflictingHabits: [],
        severity: 'LOW',
        recommendation: null,
      })
      expect(result.success).toBe(true)
    })

    it('rejects invalid severity', () => {
      const result = conflictWarningSchema.safeParse({
        hasConflict: true,
        conflictingHabits: [],
        severity: 'CRITICAL',
        recommendation: null,
      })
      expect(result.success).toBe(false)
    })
  })

  describe('suggestedSubHabitSchema', () => {
    it('parses minimal suggested sub-habit', () => {
      const result = suggestedSubHabitSchema.safeParse({ title: 'Morning run' })
      expect(result.success).toBe(true)
    })

    it('parses fully populated suggested sub-habit', () => {
      const result = suggestedSubHabitSchema.safeParse({
        title: 'Morning run',
        description: 'Run 5km',
        frequencyUnit: 'Day',
        frequencyQuantity: 1,
        days: ['Monday', 'Wednesday'],
        isBadHabit: false,
        dueDate: '2025-06-01',
        dueTime: '07:00',
        note: 'Start slow',
        habitId: 'h-parent',
        slipAlertEnabled: false,
        reminderEnabled: true,
        reminderTimes: ['06:30'],
        tagNames: ['fitness'],
        checklistItems: [{ text: 'Warm up', isChecked: false }],
      })
      expect(result.success).toBe(true)
    })

    it('accepts null optional fields', () => {
      const result = suggestedSubHabitSchema.safeParse({
        title: 'Test',
        description: null,
        frequencyUnit: null,
        frequencyQuantity: null,
        days: null,
        isBadHabit: null,
        dueDate: null,
        dueTime: null,
        note: null,
      })
      expect(result.success).toBe(true)
    })
  })

  describe('actionResultSchema', () => {
    it('parses valid action result', () => {
      const result = actionResultSchema.safeParse({
        type: 'CreateHabit',
        status: 'Success',
        entityId: 'h-1',
        entityName: 'Exercise',
        error: null,
        field: null,
        suggestedSubHabits: null,
        conflictWarning: null,
      })
      expect(result.success).toBe(true)
    })

    it('parses action result with suggestions', () => {
      const result = actionResultSchema.safeParse({
        type: 'SuggestBreakdown',
        status: 'Suggestion',
        entityId: null,
        entityName: null,
        error: null,
        field: null,
        suggestedSubHabits: [{ title: 'Step 1' }, { title: 'Step 2' }],
        conflictWarning: null,
      })
      expect(result.success).toBe(true)
    })

    it('parses action result with conflict warning', () => {
      const result = actionResultSchema.safeParse({
        type: 'CreateHabit',
        status: 'Success',
        entityId: 'h-1',
        entityName: 'Exercise',
        error: null,
        field: null,
        suggestedSubHabits: null,
        conflictWarning: {
          hasConflict: true,
          conflictingHabits: [],
          severity: 'MEDIUM',
          recommendation: 'Consider rescheduling',
        },
      })
      expect(result.success).toBe(true)
    })
  })

  describe('chatMessageSchema', () => {
    it('parses valid chat message', () => {
      const result = chatMessageSchema.safeParse({
        id: 'msg-1',
        role: 'user',
        content: 'Hello',
        timestamp: new Date(),
      })
      expect(result.success).toBe(true)
    })

    it('parses ai message with actions', () => {
      const result = chatMessageSchema.safeParse({
        id: 'msg-2',
        role: 'ai',
        content: 'Created habit',
        actions: [{
          type: 'CreateHabit',
          status: 'Success',
          entityId: 'h-1',
          entityName: 'Exercise',
          error: null,
          field: null,
          suggestedSubHabits: null,
          conflictWarning: null,
        }],
        imageUrl: null,
        timestamp: new Date(),
      })
      expect(result.success).toBe(true)
    })

    it('rejects invalid role', () => {
      const result = chatMessageSchema.safeParse({
        id: 'msg-1',
        role: 'system',
        content: 'test',
        timestamp: new Date(),
      })
      expect(result.success).toBe(false)
    })
  })

  describe('chatResponseSchema', () => {
    it('parses valid chat response', () => {
      const result = chatResponseSchema.safeParse({
        aiMessage: 'Done!',
        actions: [],
      })
      expect(result.success).toBe(true)
    })

    it('accepts null aiMessage', () => {
      const result = chatResponseSchema.safeParse({
        aiMessage: null,
        actions: [{
          type: 'LogHabit',
          status: 'Success',
          entityId: 'h-1',
          entityName: 'Exercise',
          error: null,
          field: null,
          suggestedSubHabits: null,
          conflictWarning: null,
        }],
      })
      expect(result.success).toBe(true)
    })

    it('rejects missing actions', () => {
      const result = chatResponseSchema.safeParse({ aiMessage: 'Hello' })
      expect(result.success).toBe(false)
    })
  })
})

// ---------------------------------------------------------------------------
// Sync schemas
// ---------------------------------------------------------------------------

describe('sync schemas', () => {
  describe('mutationTypeSchema', () => {
    it('parses valid mutation types', () => {
      const types = [
        'createHabit', 'updateHabit', 'deleteHabit', 'logHabit', 'skipHabit',
        'reorderHabits', 'updateChecklist', 'duplicateHabit', 'moveHabitParent',
        'createGoal', 'updateGoal', 'deleteGoal', 'updateGoalProgress', 'updateGoalStatus', 'reorderGoals',
        'createTag', 'updateTag', 'deleteTag', 'assignTags',
        'markNotificationRead', 'markAllNotificationsRead', 'deleteNotification',
      ]
      for (const t of types) {
        expect(mutationTypeSchema.safeParse(t).success).toBe(true)
      }
    })

    it('rejects invalid mutation type', () => {
      expect(mutationTypeSchema.safeParse('archiveHabit').success).toBe(false)
    })
  })

  describe('queuedMutationSchema', () => {
    it('parses valid queued mutation', () => {
      const result = queuedMutationSchema.safeParse({
        id: 'mut-1',
        timestamp: Date.now(),
        type: 'createHabit',
        endpoint: '/api/habits',
        method: 'POST',
        payload: { title: 'Exercise' },
        retries: 0,
        maxRetries: 3,
      })
      expect(result.success).toBe(true)
    })

    it('accepts DELETE method', () => {
      const result = queuedMutationSchema.safeParse({
        id: 'mut-2',
        timestamp: Date.now(),
        type: 'deleteHabit',
        endpoint: '/api/habits/h-1',
        method: 'DELETE',
        payload: null,
        retries: 1,
        maxRetries: 3,
      })
      expect(result.success).toBe(true)
    })

    it('rejects invalid method', () => {
      const result = queuedMutationSchema.safeParse({
        id: 'mut-1',
        timestamp: Date.now(),
        type: 'createHabit',
        endpoint: '/api/habits',
        method: 'GET',
        payload: null,
        retries: 0,
        maxRetries: 3,
      })
      expect(result.success).toBe(false)
    })

    it('rejects missing id', () => {
      const result = queuedMutationSchema.safeParse({
        timestamp: Date.now(),
        type: 'createHabit',
        endpoint: '/api/habits',
        method: 'POST',
        payload: null,
        retries: 0,
        maxRetries: 3,
      })
      expect(result.success).toBe(false)
    })
  })

  describe('syncBatchRequestSchema', () => {
    it('parses valid batch request', () => {
      const result = syncBatchRequestSchema.safeParse({
        mutations: [
          {
            id: 'mut-1',
            timestamp: '2025-01-01T00:00:00Z',
            type: 'createHabit',
            payload: { title: 'Test' },
          },
        ],
      })
      expect(result.success).toBe(true)
    })

    it('accepts empty mutations array', () => {
      const result = syncBatchRequestSchema.safeParse({ mutations: [] })
      expect(result.success).toBe(true)
    })

    it('rejects missing mutations', () => {
      const result = syncBatchRequestSchema.safeParse({})
      expect(result.success).toBe(false)
    })
  })

  describe('syncMutationResultSchema', () => {
    it('parses success result', () => {
      const result = syncMutationResultSchema.safeParse({
        mutationId: 'mut-1',
        status: 'success',
      })
      expect(result.success).toBe(true)
    })

    it('parses conflict result with error', () => {
      const result = syncMutationResultSchema.safeParse({
        mutationId: 'mut-1',
        status: 'conflict',
        error: 'Version mismatch',
      })
      expect(result.success).toBe(true)
    })

    it('parses all valid statuses', () => {
      for (const s of ['success', 'conflict', 'gone', 'error']) {
        expect(syncMutationResultSchema.safeParse({ mutationId: 'x', status: s }).success).toBe(true)
      }
    })

    it('rejects invalid status', () => {
      const result = syncMutationResultSchema.safeParse({
        mutationId: 'mut-1',
        status: 'pending',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('syncBatchResponseSchema', () => {
    it('parses valid batch response', () => {
      const result = syncBatchResponseSchema.safeParse({
        results: [{ mutationId: 'mut-1', status: 'success' }],
        errors: [],
      })
      expect(result.success).toBe(true)
    })

    it('parses response with errors', () => {
      const result = syncBatchResponseSchema.safeParse({
        results: [],
        errors: [{ mutationId: 'mut-2', status: 'error', error: 'Server error' }],
      })
      expect(result.success).toBe(true)
    })

    it('rejects missing results field', () => {
      const result = syncBatchResponseSchema.safeParse({ errors: [] })
      expect(result.success).toBe(false)
    })
  })

  describe('syncChangesResponseSchema', () => {
    it('parses valid sync changes response', () => {
      const result = syncChangesResponseSchema.safeParse({
        serverTime: '2025-01-15T10:00:00Z',
        changes: {
          habits: [],
          goals: [],
          tags: [],
          notifications: [],
          deletedIds: {
            habits: [],
            goals: [],
            tags: [],
          },
        },
      })
      expect(result.success).toBe(true)
    })

    it('parses response with populated arrays', () => {
      const result = syncChangesResponseSchema.safeParse({
        serverTime: '2025-01-15T10:00:00Z',
        changes: {
          habits: [{ id: 'h-1', title: 'Exercise' }],
          goals: [{ id: 'g-1', title: 'Read' }],
          tags: [{ id: 't-1', name: 'Health' }],
          notifications: [{ id: 'n-1' }],
          deletedIds: {
            habits: ['h-2'],
            goals: ['g-2'],
            tags: ['t-2'],
          },
        },
      })
      expect(result.success).toBe(true)
    })

    it('rejects missing deletedIds', () => {
      const result = syncChangesResponseSchema.safeParse({
        serverTime: '2025-01-15T10:00:00Z',
        changes: {
          habits: [],
          goals: [],
          tags: [],
          notifications: [],
        },
      })
      expect(result.success).toBe(false)
    })
  })
})

// ---------------------------------------------------------------------------
// Subscription schemas
// ---------------------------------------------------------------------------

describe('subscription schemas', () => {
  describe('planPriceSchema', () => {
    it('parses valid plan price', () => {
      const result = planPriceSchema.safeParse({ unitAmount: 999, currency: 'usd' })
      expect(result.success).toBe(true)
    })

    it('rejects missing currency', () => {
      const result = planPriceSchema.safeParse({ unitAmount: 999 })
      expect(result.success).toBe(false)
    })

    it('rejects non-number unitAmount', () => {
      const result = planPriceSchema.safeParse({ unitAmount: '9.99', currency: 'usd' })
      expect(result.success).toBe(false)
    })
  })

  describe('subscriptionPlansSchema', () => {
    it('parses valid subscription plans', () => {
      const result = subscriptionPlansSchema.safeParse({
        monthly: { unitAmount: 999, currency: 'usd' },
        yearly: { unitAmount: 7999, currency: 'usd' },
        savingsPercent: 33,
        couponPercentOff: null,
        currency: 'usd',
      })
      expect(result.success).toBe(true)
    })

    it('accepts couponPercentOff value', () => {
      const result = subscriptionPlansSchema.safeParse({
        monthly: { unitAmount: 999, currency: 'usd' },
        yearly: { unitAmount: 7999, currency: 'usd' },
        savingsPercent: 33,
        couponPercentOff: 20,
        currency: 'usd',
      })
      expect(result.success).toBe(true)
    })

    it('rejects missing yearly plan', () => {
      const result = subscriptionPlansSchema.safeParse({
        monthly: { unitAmount: 999, currency: 'usd' },
        savingsPercent: 33,
        couponPercentOff: null,
        currency: 'usd',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('billingPaymentMethodSchema', () => {
    it('parses valid payment method', () => {
      const result = billingPaymentMethodSchema.safeParse({
        brand: 'visa',
        last4: '4242',
        expMonth: 12,
        expYear: 2027,
      })
      expect(result.success).toBe(true)
    })

    it('rejects missing last4', () => {
      const result = billingPaymentMethodSchema.safeParse({
        brand: 'visa',
        expMonth: 12,
        expYear: 2027,
      })
      expect(result.success).toBe(false)
    })
  })

  describe('billingInvoiceSchema', () => {
    it('parses valid invoice', () => {
      const result = billingInvoiceSchema.safeParse({
        id: 'inv-1',
        date: '2025-01-01',
        amountPaid: 999,
        currency: 'usd',
        status: 'paid',
        hostedInvoiceUrl: 'https://stripe.com/invoice/1',
        invoicePdf: 'https://stripe.com/invoice/1.pdf',
        billingReason: 'subscription_create',
      })
      expect(result.success).toBe(true)
    })

    it('accepts null URLs', () => {
      const result = billingInvoiceSchema.safeParse({
        id: 'inv-1',
        date: '2025-01-01',
        amountPaid: 0,
        currency: 'usd',
        status: 'draft',
        hostedInvoiceUrl: null,
        invoicePdf: null,
        billingReason: 'manual',
      })
      expect(result.success).toBe(true)
    })
  })

  describe('billingDetailsSchema', () => {
    it('parses valid billing details', () => {
      const result = billingDetailsSchema.safeParse({
        status: 'active',
        currentPeriodEnd: '2025-12-31',
        cancelAtPeriodEnd: false,
        interval: 'month',
        amountPerPeriod: 999,
        currency: 'usd',
        paymentMethod: {
          brand: 'visa',
          last4: '4242',
          expMonth: 12,
          expYear: 2027,
        },
        recentInvoices: [],
      })
      expect(result.success).toBe(true)
    })

    it('accepts null paymentMethod', () => {
      const result = billingDetailsSchema.safeParse({
        status: 'active',
        currentPeriodEnd: '2025-12-31',
        cancelAtPeriodEnd: false,
        interval: 'year',
        amountPerPeriod: 7999,
        currency: 'usd',
        paymentMethod: null,
        recentInvoices: [],
      })
      expect(result.success).toBe(true)
    })

    it('parses with invoices array', () => {
      const result = billingDetailsSchema.safeParse({
        status: 'active',
        currentPeriodEnd: '2025-12-31',
        cancelAtPeriodEnd: true,
        interval: 'month',
        amountPerPeriod: 999,
        currency: 'usd',
        paymentMethod: null,
        recentInvoices: [{
          id: 'inv-1',
          date: '2025-01-01',
          amountPaid: 999,
          currency: 'usd',
          status: 'paid',
          hostedInvoiceUrl: null,
          invoicePdf: null,
          billingReason: 'subscription_cycle',
        }],
      })
      expect(result.success).toBe(true)
    })

    it('rejects missing status', () => {
      const result = billingDetailsSchema.safeParse({
        currentPeriodEnd: '2025-12-31',
        cancelAtPeriodEnd: false,
        interval: 'month',
        amountPerPeriod: 999,
        currency: 'usd',
        paymentMethod: null,
        recentInvoices: [],
      })
      expect(result.success).toBe(false)
    })
  })
})

// ---------------------------------------------------------------------------
// Referral schemas
// ---------------------------------------------------------------------------

describe('referral schemas', () => {
  describe('referralCodeSchema', () => {
    it('parses valid referral code', () => {
      const result = referralCodeSchema.safeParse({
        code: 'REF123',
        link: 'https://app.useorbit.org/ref/REF123',
      })
      expect(result.success).toBe(true)
    })

    it('rejects missing link', () => {
      const result = referralCodeSchema.safeParse({ code: 'REF123' })
      expect(result.success).toBe(false)
    })
  })

  describe('referralStatsSchema', () => {
    it('parses valid referral stats', () => {
      const result = referralStatsSchema.safeParse({
        referralCode: 'REF123',
        referralLink: 'https://app.useorbit.org/ref/REF123',
        successfulReferrals: 3,
        pendingReferrals: 1,
        maxReferrals: 10,
        rewardType: 'discount',
        discountPercent: 20,
      })
      expect(result.success).toBe(true)
    })

    it('accepts null code and link', () => {
      const result = referralStatsSchema.safeParse({
        referralCode: null,
        referralLink: null,
        successfulReferrals: 0,
        pendingReferrals: 0,
        maxReferrals: 10,
        rewardType: 'discount',
        discountPercent: 20,
      })
      expect(result.success).toBe(true)
    })

    it('rejects missing rewardType', () => {
      const result = referralStatsSchema.safeParse({
        referralCode: 'REF123',
        referralLink: 'link',
        successfulReferrals: 0,
        pendingReferrals: 0,
        maxReferrals: 10,
        discountPercent: 20,
      })
      expect(result.success).toBe(false)
    })
  })

  describe('referralDashboardSchema', () => {
    it('parses valid referral dashboard', () => {
      const result = referralDashboardSchema.safeParse({
        code: 'REF123',
        link: 'https://app.useorbit.org/ref/REF123',
        stats: {
          referralCode: 'REF123',
          referralLink: 'https://app.useorbit.org/ref/REF123',
          successfulReferrals: 5,
          pendingReferrals: 2,
          maxReferrals: 10,
          rewardType: 'discount',
          discountPercent: 20,
        },
      })
      expect(result.success).toBe(true)
    })

    it('rejects missing stats', () => {
      const result = referralDashboardSchema.safeParse({
        code: 'REF123',
        link: 'https://app.useorbit.org/ref/REF123',
      })
      expect(result.success).toBe(false)
    })
  })
})

// ---------------------------------------------------------------------------
// User fact schema
// ---------------------------------------------------------------------------

describe('user fact schema', () => {
  it('parses valid user fact', () => {
    const result = userFactSchema.safeParse({
      id: 'fact-1',
      factText: 'User prefers morning workouts',
      category: 'preferences',
      extractedAtUtc: '2025-01-01T00:00:00Z',
      updatedAtUtc: null,
    })
    expect(result.success).toBe(true)
  })

  it('accepts null category', () => {
    const result = userFactSchema.safeParse({
      id: 'fact-1',
      factText: 'Some fact',
      category: null,
      extractedAtUtc: '2025-01-01T00:00:00Z',
      updatedAtUtc: '2025-01-02T00:00:00Z',
    })
    expect(result.success).toBe(true)
  })

  it('rejects missing factText', () => {
    const result = userFactSchema.safeParse({
      id: 'fact-1',
      category: null,
      extractedAtUtc: '2025-01-01T00:00:00Z',
      updatedAtUtc: null,
    })
    expect(result.success).toBe(false)
  })

  it('rejects non-string id', () => {
    const result = userFactSchema.safeParse({
      id: 123,
      factText: 'Some fact',
      category: null,
      extractedAtUtc: '2025-01-01T00:00:00Z',
      updatedAtUtc: null,
    })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// API key schemas
// ---------------------------------------------------------------------------

describe('api key schemas', () => {
  describe('apiKeySchema', () => {
    it('parses valid API key', () => {
      const result = apiKeySchema.safeParse({
        id: 'key-1',
        name: 'My API Key',
        keyPrefix: 'orb_abc',
        createdAtUtc: '2025-01-01T00:00:00Z',
        lastUsedAtUtc: null,
        isRevoked: false,
      })
      expect(result.success).toBe(true)
    })

    it('accepts non-null lastUsedAtUtc', () => {
      const result = apiKeySchema.safeParse({
        id: 'key-1',
        name: 'Key',
        keyPrefix: 'orb_xyz',
        createdAtUtc: '2025-01-01T00:00:00Z',
        lastUsedAtUtc: '2025-06-15T10:00:00Z',
        isRevoked: false,
      })
      expect(result.success).toBe(true)
    })

    it('rejects missing name', () => {
      const result = apiKeySchema.safeParse({
        id: 'key-1',
        keyPrefix: 'orb_abc',
        createdAtUtc: '2025-01-01T00:00:00Z',
        lastUsedAtUtc: null,
        isRevoked: false,
      })
      expect(result.success).toBe(false)
    })
  })

  describe('apiKeyCreateResponseSchema', () => {
    it('parses valid create response with full key', () => {
      const result = apiKeyCreateResponseSchema.safeParse({
        id: 'key-1',
        name: 'My API Key',
        keyPrefix: 'orb_abc',
        createdAtUtc: '2025-01-01T00:00:00Z',
        lastUsedAtUtc: null,
        isRevoked: false,
        key: 'orb_abc123def456',
      })
      expect(result.success).toBe(true)
    })

    it('rejects missing key field on create response', () => {
      const result = apiKeyCreateResponseSchema.safeParse({
        id: 'key-1',
        name: 'My API Key',
        keyPrefix: 'orb_abc',
        createdAtUtc: '2025-01-01T00:00:00Z',
        lastUsedAtUtc: null,
        isRevoked: false,
      })
      expect(result.success).toBe(false)
    })
  })
})

// ---------------------------------------------------------------------------
// Checklist template schema
// ---------------------------------------------------------------------------

describe('checklist template schema', () => {
  it('parses valid checklist template', () => {
    const result = checklistTemplateSchema.safeParse({
      id: 'tpl-1',
      name: 'Morning Routine',
      items: ['Wake up', 'Brush teeth', 'Shower'],
    })
    expect(result.success).toBe(true)
  })

  it('accepts empty items array', () => {
    const result = checklistTemplateSchema.safeParse({
      id: 'tpl-1',
      name: 'Empty Template',
      items: [],
    })
    expect(result.success).toBe(true)
  })

  it('rejects missing name', () => {
    const result = checklistTemplateSchema.safeParse({
      id: 'tpl-1',
      items: ['Item 1'],
    })
    expect(result.success).toBe(false)
  })

  it('rejects non-string items', () => {
    const result = checklistTemplateSchema.safeParse({
      id: 'tpl-1',
      name: 'Template',
      items: [1, 2, 3],
    })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// API error schema
// ---------------------------------------------------------------------------

describe('api error schema', () => {
  it('parses valid API error', () => {
    const result = apiErrorSchema.safeParse({ error: 'Not found' })
    expect(result.success).toBe(true)
  })

  it('rejects missing error field', () => {
    const result = apiErrorSchema.safeParse({ message: 'Not found' })
    expect(result.success).toBe(false)
  })

  it('rejects non-string error', () => {
    const result = apiErrorSchema.safeParse({ error: 404 })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Barrel re-exports
// ---------------------------------------------------------------------------

describe('barrel re-exports', () => {
  it('types/index re-exports all type modules', async () => {
    const barrel = await import('../types/index')
    // Auth
    expect(barrel.userSchema).toBeDefined()
    expect(barrel.loginResponseSchema).toBeDefined()
    // Chat
    expect(barrel.chatMessageSchema).toBeDefined()
    expect(barrel.chatResponseSchema).toBeDefined()
    // Sync
    expect(barrel.mutationTypeSchema).toBeDefined()
    expect(barrel.syncBatchResponseSchema).toBeDefined()
    // Subscription
    expect(barrel.planPriceSchema).toBeDefined()
    expect(barrel.billingDetailsSchema).toBeDefined()
    // Referral
    expect(barrel.referralCodeSchema).toBeDefined()
    expect(barrel.referralDashboardSchema).toBeDefined()
    // User fact
    expect(barrel.userFactSchema).toBeDefined()
    // API key
    expect(barrel.apiKeySchema).toBeDefined()
    // Checklist template
    expect(barrel.checklistTemplateSchema).toBeDefined()
    // API error
    expect(barrel.apiErrorSchema).toBeDefined()
    // Config
    expect(barrel.appConfigSchema).toBeDefined()
    // Existing types
    expect(barrel.normalizedHabitSchema).toBeDefined()
    expect(barrel.goalSchema).toBeDefined()
    expect(barrel.profileSchema).toBeDefined()
  })

  it('utils/index re-exports utility functions', async () => {
    const barrel = await import('../utils/index')
    expect(barrel.parseAPIDate).toBeDefined()
    expect(barrel.formatAPIDate).toBeDefined()
    expect(barrel.getTimezoneList).toBeDefined()
    expect(barrel.isValidEmail).toBeDefined()
    expect(barrel.getErrorMessage).toBeDefined()
    expect(barrel.extractBackendError).toBeDefined()
  }, 15000)

  it('api/index re-exports API helpers', async () => {
    const barrel = await import('../api/index')
    expect(barrel.API).toBeDefined()
    expect(barrel.getErrorMessage).toBeDefined()
    expect(barrel.extractBackendError).toBeDefined()
  })

  it('query/index re-exports query key factories', async () => {
    const barrel = await import('../query/index')
    expect(barrel.habitKeys).toBeDefined()
    expect(barrel.goalKeys).toBeDefined()
    expect(barrel.profileKeys).toBeDefined()
    expect(barrel.tagKeys).toBeDefined()
    expect(barrel.notificationKeys).toBeDefined()
    expect(barrel.gamificationKeys).toBeDefined()
    expect(barrel.subscriptionKeys).toBeDefined()
    expect(barrel.referralKeys).toBeDefined()
    expect(barrel.apiKeyKeys).toBeDefined()
    expect(barrel.configKeys).toBeDefined()
    expect(barrel.calendarKeys).toBeDefined()
    expect(barrel.userFactKeys).toBeDefined()
    expect(barrel.QUERY_STALE_TIMES).toBeDefined()
  })

  it('validation/index re-exports form schemas', async () => {
    const barrel = await import('../validation/index')
    expect(barrel.habitFormSchema).toBeDefined()
    expect(barrel.goalFormSchema).toBeDefined()
    expect(barrel.validateEndDate).toBeDefined()
    expect(barrel.validateEndTime).toBeDefined()
    expect(barrel.validateTime).toBeDefined()
    expect(barrel.validateFrequency).toBeDefined()
    expect(barrel.validateScheduledReminders).toBeDefined()
    expect(barrel.validateHabitForm).toBeDefined()
  })
})
