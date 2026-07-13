import { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { API } from '@orbit/shared/api'
import { goalKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import type { Goal, PaginatedGoalResponse } from '@orbit/shared/types/goal'
import { apiClient } from '@/lib/api-client'
import { createTokensV2, radius, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

type AppTokens = ReturnType<typeof createTokensV2>

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
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])

  const { data: goals } = useQuery({
    queryKey: goalKeys.lists(),
    queryFn: fetchGoals,
    staleTime: QUERY_STALE_TIMES.goals,
  })

  const activeGoals = useMemo(
    () => goals?.filter((goal) => goal.status === 'Active') ?? [],
    [goals],
  )
  const selectedGoalIdSet = useMemo(
    () => new Set(selectedGoalIds),
    [selectedGoalIds],
  )

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{t('habits.form.goals')}</Text>
      {activeGoals.length > 0 ? (
        <View style={styles.chips}>
          {activeGoals.map((goal) => {
            const isSelected = selectedGoalIdSet.has(goal.id)
            const isDisabled = !isSelected && atGoalLimit

            return (
              <Pressable
                key={goal.id}
                style={({ pressed }) => [
                  styles.chip,
                  isSelected ? styles.chipSelected : styles.chipDefault,
                  isDisabled && styles.chipDisabled,
                  pressed && !isDisabled ? { opacity: 0.75 } : null,
                ]}
                disabled={isDisabled}
                onPress={() => onToggleGoal(goal.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected, disabled: isDisabled }}
              >
                <Text
                  style={[
                    styles.chipText,
                    isSelected ? styles.chipTextSelected : styles.chipTextDefault,
                  ]}
                >
                  {goal.title}
                  <Text
                    style={[
                      styles.chipPercentage,
                      isSelected
                        ? styles.chipPercentageSelected
                        : styles.chipPercentageDefault,
                    ]}
                  >
                    {' '}
                    {Math.round(goal.progressPercentage)}%
                  </Text>
                </Text>
              </Pressable>
            )
          })}
        </View>
      ) : (
        <Text style={styles.emptyText}>{t('habits.form.noGoals')}</Text>
      )}
    </View>
  )
}

function createStyles(tokens: AppTokens) {
  return StyleSheet.create({
    container: {
      gap: 10,
    },
    label: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 14,
      color: tokens.fg2,
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      borderRadius: radius.full,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderWidth: 1,
    },
    chipDefault: {
      backgroundColor: tokens.bgElev,
      borderColor: tokens.hairline,
    },
    chipSelected: {
      backgroundColor: tokens.selectionBg,
      borderColor: tintFromPrimary(tokens, 0.45),
    },
    chipDisabled: {
      opacity: 0.35,
    },
    chipText: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 13,
    },
    chipTextDefault: {
      color: tokens.fg2,
    },
    chipTextSelected: {
      color: tokens.primarySoft,
    },
    chipPercentage: {
      fontFamily: 'Roboto_400Regular',
      fontSize: 11,
      fontVariant: ['tabular-nums'],
    },
    chipPercentageDefault: {
      color: tokens.fg3,
    },
    chipPercentageSelected: {
      color: tokens.primarySoft,
    },
    emptyText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      color: tokens.fg3,
    },
  })
}
