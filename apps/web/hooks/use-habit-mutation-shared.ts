'use client'

import { useQueryClient } from '@tanstack/react-query'
import { habitKeys, goalKeys, profileKeys } from '@orbit/shared/query'

export function invalidateHabitListQueries(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
  void queryClient.invalidateQueries({ queryKey: habitKeys.searches() })
  void queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
}

export function invalidateHabitStructureQueries(queryClient: ReturnType<typeof useQueryClient>): void {
  invalidateHabitListQueries(queryClient)
  void queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
  void queryClient.invalidateQueries({ queryKey: habitKeys.retrospectivePrefix() })
}

export function invalidateHabitInventoryQueries(queryClient: ReturnType<typeof useQueryClient>): void {
  invalidateHabitListQueries(queryClient)
  void queryClient.invalidateQueries({ queryKey: habitKeys.count() })
  void queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
  void queryClient.invalidateQueries({ queryKey: habitKeys.retrospectivePrefix() })
}

export function invalidateHabitDeleteQueries(queryClient: ReturnType<typeof useQueryClient>): void {
  invalidateHabitInventoryQueries(queryClient)
  void queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
  void queryClient.invalidateQueries({ queryKey: profileKeys.all })
}
