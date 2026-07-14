import { describe, expect, it } from 'vitest'
import {
  activateNextCelebration,
  clearCelebrationKind,
  createCelebrationItem,
  enqueueCelebrationItem,
  getCelebrationPriority,
  isDuplicateCelebration,
  sortCelebrationQueue,
  type CelebrationKind,
  type CelebrationQueueItem,
} from '../stores/celebration-queue'

describe('getCelebrationPriority', () => {
  it('ranks kinds from streak (highest) to level-up (lowest)', () => {
    expect(getCelebrationPriority('streak')).toBe(0)
    expect(getCelebrationPriority('achievement')).toBe(1)
    expect(getCelebrationPriority('goal-completed')).toBe(2)
    expect(getCelebrationPriority('all-done')).toBe(2)
    expect(getCelebrationPriority('level-up')).toBe(3)
  })

  it('falls back to 99 for an unknown kind', () => {
    expect(getCelebrationPriority('mystery' as CelebrationKind)).toBe(99)
  })
})

describe('sortCelebrationQueue', () => {
  it('orders by priority then by sequence, without mutating the input', () => {
    const queue: CelebrationQueueItem[] = [
      createCelebrationItem('level-up', { level: 2 }, 5),
      createCelebrationItem('streak', { streak: 3 }, 4),
      createCelebrationItem('all-done', {}, 1),
      createCelebrationItem('goal-completed', { name: 'Ship' }, 0),
    ]

    const sorted = sortCelebrationQueue(queue)

    expect(sorted.map((item) => item.kind)).toEqual([
      'streak',
      'goal-completed',
      'all-done',
      'level-up',
    ])
    expect(queue[0]?.kind).toBe('level-up')
  })
})

describe('isDuplicateCelebration', () => {
  it('matches by kind-specific payload identity', () => {
    const active = createCelebrationItem('streak', { streak: 5 }, 0)
    const queued = [createCelebrationItem('achievement', { achievementId: 'a1', xpReward: 10 }, 1)]

    expect(
      isDuplicateCelebration(queued, active, createCelebrationItem('streak', { streak: 5 }, 2)),
    ).toBe(true)
    expect(
      isDuplicateCelebration(queued, active, createCelebrationItem('streak', { streak: 9 }, 2)),
    ).toBe(false)
    expect(
      isDuplicateCelebration(queued, active, createCelebrationItem('achievement', { achievementId: 'a1', xpReward: 99 }, 2)),
    ).toBe(true)
    expect(
      isDuplicateCelebration(queued, active, createCelebrationItem('goal-completed', { name: 'Ship' }, 2)),
    ).toBe(false)
  })

  it('treats every all-done as a duplicate of an existing all-done', () => {
    const queued = [createCelebrationItem('all-done', {}, 0)]

    expect(isDuplicateCelebration(queued, null, createCelebrationItem('all-done', {}, 1))).toBe(true)
    expect(isDuplicateCelebration(queued, null, createCelebrationItem('level-up', { level: 4 }, 1))).toBe(false)
  })

  it('matches level-up by level', () => {
    const queued = [createCelebrationItem('level-up', { level: 3 }, 0)]

    expect(isDuplicateCelebration(queued, null, createCelebrationItem('level-up', { level: 3 }, 1))).toBe(true)
    expect(isDuplicateCelebration(queued, null, createCelebrationItem('level-up', { level: 4 }, 1))).toBe(false)
  })
})

describe('createCelebrationItem', () => {
  it('stamps a deterministic id and the kind priority', () => {
    const item = createCelebrationItem('goal-completed', { name: 'Ship Orbit' }, 7)

    expect(item).toEqual({
      id: 'goal-completed-7',
      kind: 'goal-completed',
      payload: { name: 'Ship Orbit' },
      priority: 2,
      sequence: 7,
    })
  })
})

describe('activateNextCelebration', () => {
  it('returns an empty active state for an empty queue', () => {
    expect(activateNextCelebration([])).toEqual({
      activeCelebration: null,
      queuedCelebrations: [],
      streakCelebration: null,
      allDoneCelebration: false,
      goalCompletedCelebration: null,
    })
  })

  it('promotes the highest-priority item and derives legacy streak state', () => {
    const result = activateNextCelebration([
      createCelebrationItem('level-up', { level: 2 }, 1),
      createCelebrationItem('streak', { streak: 6 }, 0),
    ])

    expect(result.activeCelebration?.kind).toBe('streak')
    expect(result.queuedCelebrations.map((item) => item.kind)).toEqual(['level-up'])
    expect(result.streakCelebration).toEqual({ streak: 6 })
    expect(result.allDoneCelebration).toBe(false)
  })

  it('derives legacy all-done and goal-completed state', () => {
    expect(activateNextCelebration([createCelebrationItem('all-done', {}, 0)]).allDoneCelebration).toBe(true)
    expect(
      activateNextCelebration([createCelebrationItem('goal-completed', { name: 'Ship' }, 0)]).goalCompletedCelebration,
    ).toEqual({ name: 'Ship' })
  })
})

describe('enqueueCelebrationItem', () => {
  it('ignores duplicates', () => {
    const state = {
      activeCelebration: createCelebrationItem('streak', { streak: 4 }, 0),
      queuedCelebrations: [],
    }

    expect(enqueueCelebrationItem(state, createCelebrationItem('streak', { streak: 4 }, 1))).toEqual({})
  })

  it('queues behind an active celebration in priority order', () => {
    const state = {
      activeCelebration: createCelebrationItem('achievement', { achievementId: 'a', xpReward: 5 }, 0),
      queuedCelebrations: [createCelebrationItem('level-up', { level: 2 }, 1)],
    }

    const result = enqueueCelebrationItem(state, createCelebrationItem('streak', { streak: 8 }, 2))

    expect(result.queuedCelebrations?.map((item) => item.kind)).toEqual(['streak', 'level-up'])
  })

  it('activates immediately when nothing is in flight', () => {
    const result = enqueueCelebrationItem(
      { activeCelebration: null, queuedCelebrations: [] },
      createCelebrationItem('streak', { streak: 2 }, 0),
    )

    expect(result.activeCelebration?.kind).toBe('streak')
  })
})

describe('clearCelebrationKind', () => {
  it('promotes the next celebration when the active one is cleared', () => {
    const state = {
      activeCelebration: createCelebrationItem('streak', { streak: 3 }, 0),
      queuedCelebrations: [createCelebrationItem('level-up', { level: 2 }, 1)],
    }

    const result = clearCelebrationKind(state, 'streak', { streakCelebration: null })

    expect(result.activeCelebration?.kind).toBe('level-up')
  })

  it('only filters the queue when a different kind is active', () => {
    const state = {
      activeCelebration: createCelebrationItem('achievement', { achievementId: 'a', xpReward: 5 }, 0),
      queuedCelebrations: [
        createCelebrationItem('goal-completed', { name: 'Ship' }, 1),
        createCelebrationItem('level-up', { level: 2 }, 2),
      ],
    }

    const result = clearCelebrationKind(state, 'goal-completed', { goalCompletedCelebration: null })

    expect(result.queuedCelebrations?.map((item) => item.kind)).toEqual(['level-up'])
    expect(result.goalCompletedCelebration).toBeNull()
    expect(result.activeCelebration).toBeUndefined()
  })
})
