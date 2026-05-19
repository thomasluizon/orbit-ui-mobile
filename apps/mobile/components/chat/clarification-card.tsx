import { useMemo, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import { Check } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import type { ClarificationRequest } from '@orbit/shared/types/chat'
import { useResolveClarification } from '@/hooks/use-resolve-clarification'
import { radius, shadows } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface ClarificationCardProps {
  clarificationRequest: ClarificationRequest
  entityName?: string | null
}

export function ClarificationCard({
  clarificationRequest,
  entityName,
}: Readonly<ClarificationCardProps>) {
  const { t } = useTranslation()
  const { colors } = useAppTheme()
  const resolve = useResolveClarification()
  const styles = useMemo(() => createStyles(colors), [colors])

  const [activeValue, setActiveValue] = useState<string | null>(null)
  const [resolved, setResolved] = useState(false)
  const [resolvedLabel, setResolvedLabel] = useState<string | null>(null)
  const [errorKey, setErrorKey] = useState<string | null>(null)

  async function handleSelect(label: string, value: string) {
    if (resolve.isPending || resolved) return
    setActiveValue(value)
    setErrorKey(null)

    try {
      await resolve.mutateAsync({
        operationId: clarificationRequest.operationId,
        value,
      })
      setResolved(true)
      setResolvedLabel(label)
    } catch (err: unknown) {
      const status =
        typeof err === 'object' &&
        err !== null &&
        'status' in err &&
        typeof (err as { status?: unknown }).status === 'number'
          ? (err as { status: number }).status
          : 0
      setErrorKey(
        status === 404
          ? 'habits.clarification.errorExpired'
          : 'habits.clarification.errorGeneric',
      )
    } finally {
      setActiveValue(null)
    }
  }

  if (resolved) {
    return (
      <View style={styles.card}>
        <View style={styles.successRow}>
          <View style={styles.successIcon}>
            <Check size={14} color={colors.emerald400} />
          </View>
          <Text style={styles.successText}>
            {t('habits.clarification.successCreated', {
              name: entityName ?? resolvedLabel ?? '',
            })}
          </Text>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.card}>
      <Text style={styles.questionText}>
        {t(clarificationRequest.question, {
          defaultValue: t('habits.clarification.questionFallback'),
        })}
      </Text>

      <View style={styles.actionsRow}>
        {clarificationRequest.quickActions.map((action) => {
          const label = t(action.label)
          const isActive = activeValue === action.value
          const disabled = resolve.isPending

          return (
            <TouchableOpacity
              key={action.value}
              style={[styles.chip, isActive && styles.chipActive, disabled && styles.chipDisabled]}
              activeOpacity={0.7}
              disabled={disabled}
              onPress={() => handleSelect(label, action.value)}
            >
              {isActive && <ActivityIndicator size="small" color={colors.primary} />}
              <Text style={styles.chipText}>{label}</Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {errorKey && <Text style={styles.errorText}>{t(errorKey)}</Text>}
    </View>
  )
}

function createStyles(colors: ReturnType<typeof useAppTheme>['colors']) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surfaceOverlay,
      borderWidth: 1,
      borderColor: colors.borderMuted,
      borderRadius: radius.xl,
      padding: 16,
      gap: 12,
      ...shadows.sm,
      elevation: 2,
    },
    questionText: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.textPrimary,
    },
    actionsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: radius.full,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.borderMuted,
    },
    chipActive: {
      borderColor: colors.primary_30,
      backgroundColor: colors.primary_20,
    },
    chipDisabled: {
      opacity: 0.5,
    },
    chipText: {
      fontSize: 12,
      fontWeight: '500',
      color: colors.textPrimary,
    },
    errorText: {
      fontSize: 12,
      color: colors.red400,
    },
    successRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 4,
    },
    successIcon: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: colors.emerald500_20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    successText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.emerald400,
    },
  })
}
