import { formatAPIDateInTimeZone, selectAstraSuggestionHabits } from "@orbit/shared/utils";
import type { AstraSuggestionHabits } from "@orbit/shared/utils";
import { useHabits } from "@/hooks/use-habit-queries";
import { useProfile } from "@/hooks/use-profile";

/**
 * The two habits the empty Astra conversation may name. Reads today's habit list,
 * the same query Hoje runs, so an open conversation serves it from cache.
 */
export function useAstraSuggestionHabits(): AstraSuggestionHabits {
  const { profile } = useProfile();
  const today = formatAPIDateInTimeZone(new Date(), profile?.timeZone);
  const habitsQuery = useHabits(
    { dateFrom: today, dateTo: today, includeOverdue: true },
    { completeDay: true },
  );

  return selectAstraSuggestionHabits(habitsQuery.data?.topLevelHabits ?? [], today);
}
