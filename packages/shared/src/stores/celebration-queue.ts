export type CelebrationKind =
  | "streak"
  | "achievement"
  | "all-done"
  | "goal-completed"
  | "level-up";

export interface CelebrationPayloadMap {
  streak: { streak: number };
  achievement: { achievementId: string; xpReward: number };
  "all-done": Record<string, never>;
  "goal-completed": { name: string };
  "level-up": { level: number };
}

export type CelebrationQueueItem =
  | {
      id: string;
      kind: "streak";
      payload: CelebrationPayloadMap["streak"];
      priority: number;
      sequence: number;
    }
  | {
      id: string;
      kind: "achievement";
      payload: CelebrationPayloadMap["achievement"];
      priority: number;
      sequence: number;
    }
  | {
      id: string;
      kind: "all-done";
      payload: CelebrationPayloadMap["all-done"];
      priority: number;
      sequence: number;
    }
  | {
      id: string;
      kind: "goal-completed";
      payload: CelebrationPayloadMap["goal-completed"];
      priority: number;
      sequence: number;
    }
  | {
      id: string;
      kind: "level-up";
      payload: CelebrationPayloadMap["level-up"];
      priority: number;
      sequence: number;
    };

export interface CelebrationState {
  activeCelebration: CelebrationQueueItem | null;
  queuedCelebrations: CelebrationQueueItem[];
  streakCelebration: { streak: number } | null;
  allDoneCelebration: boolean;
  goalCompletedCelebration: { name: string } | null;
}

export type ActiveCelebrationState = Pick<
  CelebrationState,
  | "activeCelebration"
  | "queuedCelebrations"
  | "streakCelebration"
  | "allDoneCelebration"
  | "goalCompletedCelebration"
>;

export function getCelebrationPriority(kind: CelebrationKind): number {
  switch (kind) {
    case "streak":
      return 0;
    case "achievement":
      return 1;
    case "goal-completed":
    case "all-done":
      return 2;
    case "level-up":
      return 3;
    default:
      return 99;
  }
}

export function sortCelebrationQueue(
  queue: CelebrationQueueItem[],
): CelebrationQueueItem[] {
  return [...queue].sort((left, right) => {
    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }

    return left.sequence - right.sequence;
  });
}

export function isDuplicateCelebration(
  queue: CelebrationQueueItem[],
  active: CelebrationQueueItem | null,
  candidate: CelebrationQueueItem,
): boolean {
  const matches = [active, ...queue]
    .filter((item): item is CelebrationQueueItem => item !== null)
    .some((item) => {
      if (item.kind !== candidate.kind) return false;

      switch (item.kind) {
        case "streak":
          return (
            item.payload.streak ===
            (candidate.payload as CelebrationPayloadMap["streak"]).streak
          );
        case "achievement":
          return (
            item.payload.achievementId ===
            (candidate.payload as CelebrationPayloadMap["achievement"])
              .achievementId
          );
        case "goal-completed":
          return (
            item.payload.name ===
            (candidate.payload as CelebrationPayloadMap["goal-completed"]).name
          );
        case "level-up":
          return (
            item.payload.level ===
            (candidate.payload as CelebrationPayloadMap["level-up"]).level
          );
        case "all-done":
          return true;
        default:
          return false;
      }
    });

  return matches;
}

export function createCelebrationItem<TKind extends CelebrationKind>(
  kind: TKind,
  payload: CelebrationPayloadMap[TKind],
  sequence: number,
): Extract<CelebrationQueueItem, { kind: TKind }> {
  return {
    id: `${kind}-${sequence}`,
    kind,
    payload,
    priority: getCelebrationPriority(kind),
    sequence,
  } as Extract<CelebrationQueueItem, { kind: TKind }>;
}

function deriveLegacyCelebrationState(
  activeCelebration: CelebrationQueueItem | null,
): Pick<
  CelebrationState,
  "streakCelebration" | "allDoneCelebration" | "goalCompletedCelebration"
> {
  return {
    streakCelebration:
      activeCelebration?.kind === "streak" ? activeCelebration.payload : null,
    allDoneCelebration: activeCelebration?.kind === "all-done",
    goalCompletedCelebration:
      activeCelebration?.kind === "goal-completed"
        ? activeCelebration.payload
        : null,
  };
}

export function activateNextCelebration(
  queue: CelebrationQueueItem[],
): ActiveCelebrationState {
  const sortedQueue = sortCelebrationQueue(queue);
  const [nextCelebration, ...remainingCelebrations] = sortedQueue;

  return {
    activeCelebration: nextCelebration ?? null,
    queuedCelebrations: remainingCelebrations,
    ...deriveLegacyCelebrationState(nextCelebration ?? null),
  };
}

export function enqueueCelebrationItem(
  state: Pick<CelebrationState, "activeCelebration" | "queuedCelebrations">,
  item: CelebrationQueueItem,
): Partial<CelebrationState> {
  if (
    isDuplicateCelebration(
      state.queuedCelebrations,
      state.activeCelebration,
      item,
    )
  ) {
    return {};
  }

  const nextQueue = [...state.queuedCelebrations, item];
  if (state.activeCelebration) {
    return { queuedCelebrations: sortCelebrationQueue(nextQueue) };
  }

  return activateNextCelebration(nextQueue);
}

export function clearCelebrationKind(
  state: Pick<CelebrationState, "activeCelebration" | "queuedCelebrations">,
  kind: CelebrationKind,
  clearedLegacyState: Partial<CelebrationState>,
): Partial<CelebrationState> {
  const remainingQueued = state.queuedCelebrations.filter(
    (item) => item.kind !== kind,
  );
  if (state.activeCelebration?.kind === kind) {
    return activateNextCelebration(remainingQueued);
  }

  return { queuedCelebrations: remainingQueued, ...clearedLegacyState };
}
