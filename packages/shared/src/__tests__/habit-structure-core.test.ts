import { QueryClient } from '@tanstack/query-core'
import { expect,it } from 'vitest'
import { applyHabitChecklistDetails,applyHabitStructurePatch } from '../hooks/habit-structure-core'
import { habitKeys } from '../query/keys'
import { makeEnrichedHabitDetail } from '../test-support/habit-detail-fixtures'
import { createMockHabitScheduleItem } from './factories'
import type { HabitDetail,HabitScheduleItem } from '../types/habit'



it('updates structure in the list and detail caches while retaining their snapshots', () => {
  const client = new QueryClient()
  const row = createMockHabitScheduleItem({ id: 'habit', title: 'Before' })
  const detail = { ...makeEnrichedHabitDetail(), id: row.id, title: row.title }
  client.setQueryData(habitKeys.list({}), [row])
  client.setQueryData(habitKeys.detail(row.id), detail)
  const previous = applyHabitStructurePatch(client, row.id, { title: 'After', isBadHabit: false }, { title: 'After' })
  expect(previous).toHaveLength(1)
  expect(client.getQueryData<HabitScheduleItem[]>(habitKeys.list({}))?.[0]?.title).toBe('After')
  expect(client.getQueryData<HabitDetail>(habitKeys.detail(row.id))?.title).toBe('After')
  const checklist = [{ text: 'Ready', isChecked: true }]
  const snapshot = applyHabitChecklistDetails(client, row.id, checklist)
  expect(snapshot.previousDetail?.checklistItems).toEqual(detail.checklistItems)
  expect(client.getQueryData<HabitDetail>(habitKeys.detail(row.id))?.checklistItems).toEqual(checklist)
})
