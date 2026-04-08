import React from 'react'
import { describe, expect, it, vi } from 'vitest'
const TestRenderer = require('react-test-renderer')

vi.mock('lucide-react-native', () => ({
  BarChart3: () => null,
  Flame: () => null,
  Trophy: () => null,
}))

import {
  HabitDetailActionButtons,
  HabitDetailRecentNotes,
  HabitDetailStatsGrid,
} from '@/components/habits/habit-detail-sections'

function findTextNodes(tree: ReturnType<typeof TestRenderer.create>, text: string) {
  return tree.root.findAll((node: { props: { children?: unknown } }) => {
    const props = node.props
    if (!props || typeof props.children !== 'string') {
      return false
    }
    return props.children === text
  })
}

describe('habit detail sections', () => {
  it('renders the stats grid', () => {
    let tree: ReturnType<typeof TestRenderer.create> | null = null
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <HabitDetailStatsGrid
          metrics={{
            currentStreak: 5,
            longestStreak: 14,
            monthlyCompletionRate: 85.5,
          }}
          loading={false}
          t={(key, params) =>
            params ? `${key}(${JSON.stringify(params)})` : key
          }
          colors={{
            primary: '#2563eb',
            surfaceGround: '#fff',
            borderMuted: '#cbd5e1',
            textSecondary: '#334155',
            textPrimary: '#0f172a',
          }}
          styles={{
            statsGrid: { flexDirection: 'row' },
            statCard: { padding: 8 },
            statLabel: { fontSize: 10 },
            statValue: { fontSize: 18 },
            skeletonIcon: { width: 20, height: 20 },
            skeletonLabel: { width: 40, height: 10 },
            skeletonValue: { width: 32, height: 20 },
          }}
        />,
      )
    })

    expect(tree).not.toBeNull()
    expect(findTextNodes(tree!, 'habits.detail.currentStreak').length).toBeGreaterThanOrEqual(1)
    expect(findTextNodes(tree!, 'habits.detail.streakDays({"n":5})').length).toBeGreaterThanOrEqual(1)
    expect(findTextNodes(tree!, 'habits.detail.monthlyRate').length).toBeGreaterThanOrEqual(1)
  })

  it('renders recent notes and action buttons', () => {
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    let tree: ReturnType<typeof TestRenderer.create> | null = null
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <>
          <HabitDetailRecentNotes
            notes={[
              {
                id: 'note-1',
                dateLabel: 'Jan 15, 2025',
                note: 'Felt great today',
              },
            ]}
            t={(key) => key}
            styles={{
              notesSection: { gap: 8 },
              sectionTitle: { fontSize: 14 },
              notesList: { gap: 8 },
              noteCard: { padding: 12 },
              noteDate: { fontSize: 10 },
              noteText: { fontSize: 14 },
            }}
          />
          <HabitDetailActionButtons
            onEdit={onEdit}
            onDelete={onDelete}
            t={(key) => key}
            styles={{
              buttonRow: { flexDirection: 'row' },
              editButton: { padding: 8 },
              editButtonText: { fontSize: 14 },
              deleteButton: { padding: 8 },
              deleteButtonText: { fontSize: 14 },
            }}
          />
        </>,
      )
    })

    expect(tree).not.toBeNull()
    expect(findTextNodes(tree!, 'habits.detail.recentNotes').length).toBeGreaterThanOrEqual(1)
    expect(findTextNodes(tree!, 'Jan 15, 2025').length).toBeGreaterThanOrEqual(1)
    expect(findTextNodes(tree!, 'Felt great today').length).toBeGreaterThanOrEqual(1)
    expect(findTextNodes(tree!, 'common.edit').length).toBeGreaterThanOrEqual(1)
    expect(findTextNodes(tree!, 'common.delete').length).toBeGreaterThanOrEqual(1)

    expect(onEdit).not.toHaveBeenCalled()
    expect(onDelete).not.toHaveBeenCalled()
  })
})
