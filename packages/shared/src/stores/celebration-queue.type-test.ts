import type { CelebrationKind, CelebrationPayloadMap, CelebrationQueueItem } from './celebration-queue'

type SurvivingKind = 'streak' | 'all-done' | 'goal-completed' | 'level-up'
type IsExact<T, U> = [T] extends [U] ? [U] extends [T] ? true : false : false
type Assert<T extends true> = T
type AcceptedKind<T extends CelebrationKind> = T

export type CelebrationKindContract = [
  Assert<IsExact<CelebrationKind, SurvivingKind>>,
  Assert<IsExact<keyof CelebrationPayloadMap, SurvivingKind>>,
  Assert<IsExact<CelebrationQueueItem['kind'], SurvivingKind>>,
  // @ts-expect-error achievements cannot enter the celebration queue
  AcceptedKind<'achievement'>,
]
