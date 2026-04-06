import { useMemo } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { API } from '@orbit/shared/api'
import { goalKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import type { Goal, PaginatedGoalResponse } from '@orbit/shared/types/goal'
import { apiClient } from '@/lib/api-client'
import { radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface GoalLinkingFieldProps {
  selectedGoalIds: string[]
  atGoalLimit: boolean
  onToggleGoal: (goalId: string) => void
}

async function fetchGoals(): Promise<Goal[]> {
  const response = await apiClient<PaginatedGoalResponse | Goal[]>(API.goals.list)
  return Array.isArray(response) ? response : response.items
}

export function GoalLinkingField({
  selectedGoalIds,
  atGoalLimit,
  onToggleGoal,
}: Readonly<GoalLinkingFieldProps>) {
  const { t } = useTranslation()
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])

  const { data: goals } = useQuery({
    queryKey: goalKeys.lists(),
    queryFn: fetchGoals,
    staleTime: QUERY_STALE_TIMES.goals,
  })

  const activeGoals = useMemo(
    () => goals?.filter((goal) => goal.status === 'Active') ?? [],
    [goals],
  )

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{t('habits.form.goals')}</Text>
      {activeGoals.length > 0 ? (
        <View style={styles.chips}>
          {activeGoals.map((goal) => {
            const isSelected = selectedGoalIds.includes(goal.id)
            const isDisabled = !isSelected && atGoalLimit

            return (
              <TouchableOpacity
                key={goal.id}
                style={[
                  styles.chip,
                  isSelected ? styles.chipSelected : styles.chipDefault,
                  isDisabled && styles.chipDisabled,
                ]}
                disabled={isDisabled}
                onPress={() => onToggleGoal(goal.id)}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.chipText,
                    isSelected ? styles.chipTextSelected : styles.chipTextDefault,
                  ]}
                >
                  {goal.title}
                  <Text style={styles.chipPercentage}>
                    {' '}
                    {Math.round(goal.progressPercentage)}%
                  </Text>
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>
      ) : (
        <Text style={styles.emptyText}>{t('habits.form.noGoals')}</Text>
      )}
    </View>
  )
}

function createStyles(colors: ReturnType<typeof useAppTheme>['colors']) {
  return StyleSheet.create({
    container: {
      gap: 10,
    },
    label: {
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
      color: colors.textMuted,
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      borderRadius: radius.xl,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderWidth: 1,
    },
    chipDefault: {
      backgroundColor: colors.surface,
      borderColor: colors.borderMuted,
    },
    chipSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    chipDisabled: {
      opacity: 0.35,
    },
    chipText: {
      fontSize: 12,
      fontWeight: '700',
    },
    chipTextDefault: {
      color: colors.textSecondary,
    },
    chipTextSelected: {
      color: colors.white,
    },
    chipPercentage: {
      opacity: 0.72,
    },
    emptyText: {
      fontSize: 13,
      color: colors.textMuted,
    },
  })
}
